import { describe, expect, it } from "vitest";

import {
  assignMissingTaskNumbers,
  buildProjectTaskRecords,
  cloneKanbanMetadataForDuplicate,
  ensureUniqueKanbanTaskIds,
  getTaskTitle,
  getTaskDependencyState,
  parseKanbanMetadata,
  syncLinkedTaskReferences,
} from "./kanbanModel";

describe("kanbanModel", () => {
  it("returns a trimmed first line title and handles non-string runtime input", () => {
    expect(getTaskTitle("   Journey to the west   \nSecond line")).toBe(
      "Journey to the west",
    );
    expect(getTaskTitle(undefined)).toBe("");
    expect(getTaskTitle(null)).toBe("");
  });

  it("parses task numbers and linked tasks from metadata", () => {
    const result = parseKanbanMetadata({
      columns: [
        {
          id: "c-1",
          title: "Master",
          tasks: [
            {
              id: "t-1",
              text: "Journey to the west",
              checked: false,
              taskNumber: 33,
              linkedTasks: [
                {
                  blockId: "block-b",
                  taskId: "t-114",
                  taskNumber: 114,
                  title: "Prepare provisions",
                  blockTitle: "Provisions",
                  relationType: "blocked-by",
                },
              ],
            },
          ],
        },
      ],
      fields: [],
    });

    expect(result.columns[0]?.tasks[0]?.taskNumber).toBe(33);
    expect(result.columns[0]?.tasks[0]?.linkedTasks).toEqual([
      {
        blockId: "block-b",
        taskId: "t-114",
        taskNumber: 114,
        title: "Prepare provisions",
        blockTitle: "Provisions",
        relationType: "blocked-by",
      },
    ]);
  });

  it("assigns numbers only to tasks that are missing them", () => {
    const result = assignMissingTaskNumbers(
      [
        {
          id: "c-1",
          title: "Todo",
          tasks: [
            { id: "t-1", text: "Existing", checked: false, taskNumber: 33 },
            { id: "t-2", text: "Needs number", checked: false },
            { id: "t-3", text: "Also needs number", checked: false },
          ],
        },
      ],
      34,
    );

    expect(result.changed).toBe(true);
    expect(result.columns[0]?.tasks.map((task) => task.taskNumber)).toEqual([
      33, 34, 35,
    ]);
    expect(result.nextTaskNumber).toBe(36);
  });

  it("reassigns duplicate task numbers when kanban ids collide", () => {
    const result = assignMissingTaskNumbers(
      [
        {
          id: "c-1",
          title: "Todo",
          tasks: [
            { id: "t-1", text: "Original", checked: false, taskNumber: 33 },
            {
              id: "t-2",
              text: "Duplicated immutable id",
              checked: false,
              taskNumber: 33,
            },
            { id: "t-3", text: "Needs number", checked: false },
          ],
        },
      ],
      34,
    );

    expect(result.changed).toBe(true);
    expect(result.columns[0]?.tasks.map((task) => task.taskNumber)).toEqual([
      33, 34, 35,
    ]);
    expect(result.nextTaskNumber).toBe(36);
  });

  it("reassigns task numbers that collide with older kanban boards", () => {
    const result = assignMissingTaskNumbers(
      [
        {
          id: "c-1",
          title: "Todo",
          tasks: [
            { id: "t-1", text: "Copied task", checked: false, taskNumber: 33 },
            { id: "t-2", text: "Also copied", checked: false, taskNumber: 34 },
          ],
        },
      ],
      40,
      { reservedTaskNumbers: new Set([33, 34, 35, 36, 37, 38, 39]) },
    );

    expect(result.changed).toBe(true);
    expect(result.columns[0]?.tasks.map((task) => task.taskNumber)).toEqual([
      40, 41,
    ]);
    expect(result.nextTaskNumber).toBe(42);
  });

  it("uses explicit column workflow state to mark dependencies as done", () => {
    const records = buildProjectTaskRecords({
      nodes: [],
      currentBlockId: "block-master",
      currentBlockTitle: "Master board",
      currentColumns: [
        {
          id: "c-done",
          title: "Release lane",
          workflowState: "done",
          tasks: [
            {
              id: "t-1",
              text: "Ship release",
              checked: false,
              linkedTasks: [],
            },
          ],
        },
      ],
    });

    expect(records[0]?.isDone).toBe(true);
  });

  it("returns no cloned metadata when the source kanban has no saved metadata yet", () => {
    const result = cloneKanbanMetadataForDuplicate({
      raw: undefined,
      sourceBlockId: "block-source",
      targetBlockId: "block-copy",
    });

    expect(result).toBeUndefined();
  });

  it("returns no cloned metadata for an empty persisted kanban shell", () => {
    const result = cloneKanbanMetadataForDuplicate({
      raw: JSON.stringify({ columns: [], fields: [] }),
      sourceBlockId: "block-source",
      targetBlockId: "block-copy",
    });

    expect(result).toBeUndefined();
  });

  it("clones kanban metadata with fresh task ids for duplicated blocks", () => {
    const result = cloneKanbanMetadataForDuplicate({
      raw: {
        columns: [
          {
            id: "c-1",
            title: "Todo",
            tasks: [
              {
                id: "t-1",
                text: "Prepare the journey",
                checked: false,
                taskNumber: 41,
                linkedTasks: [
                  {
                    blockId: "block-source",
                    taskId: "t-2",
                    taskNumber: 42,
                    relationType: "blocked-by",
                  },
                ],
              },
              {
                id: "t-2",
                text: "Pack supplies",
                checked: false,
                taskNumber: 42,
              },
            ],
          },
        ],
        fields: [],
      },
      sourceBlockId: "block-source",
      targetBlockId: "block-copy",
    });

    const parsed = parseKanbanMetadata(result);
    const duplicatedTasks = parsed.columns[0]?.tasks ?? [];

    expect(parsed.columns[0]?.id).not.toBe("c-1");
    expect(duplicatedTasks).toHaveLength(2);
    expect(duplicatedTasks[0]?.id).not.toBe("t-1");
    expect(duplicatedTasks[1]?.id).not.toBe("t-2");
    expect(duplicatedTasks[0]?.taskNumber).toBeUndefined();
    expect(duplicatedTasks[1]?.taskNumber).toBeUndefined();
    expect(duplicatedTasks[0]?.linkedTasks?.[0]).toEqual({
      blockId: "block-copy",
      taskId: duplicatedTasks[1]?.id,
      taskNumber: undefined,
      relationType: "blocked-by",
    });
  });

  it("deduplicates repeated task ids and remaps local links", () => {
    const result = ensureUniqueKanbanTaskIds(
      [
        {
          id: "c-1",
          title: "Todo",
          tasks: [
            {
              id: "task-1",
              text: "Prepare the journey",
              checked: false,
              linkedTasks: [
                {
                  blockId: "block-copy",
                  taskId: "task-2",
                  relationType: "blocked-by",
                },
              ],
            },
            {
              id: "task-2",
              text: "Pack supplies",
              checked: false,
            },
          ],
        },
        {
          id: "c-2",
          title: "Doing",
          tasks: [
            {
              id: "task-1",
              text: "Duplicate id",
              checked: false,
            },
          ],
        },
      ],
      {
        currentBlockId: "block-copy",
        reservedTaskIds: new Set(["external-task"]),
      },
    );

    const firstTaskId = result.columns[0]?.tasks[0]?.id;
    const duplicateTaskId = result.columns[1]?.tasks[0]?.id;

    expect(result.changed).toBe(true);
    expect(firstTaskId).toBe("task-1");
    expect(duplicateTaskId).not.toBe("task-1");
    expect(result.columns[0]?.tasks[0]?.linkedTasks?.[0]).toEqual({
      blockId: "block-copy",
      taskId: "task-2",
      relationType: "blocked-by",
    });
  });

  it("keeps live link metadata and removes stale references", () => {
    const result = syncLinkedTaskReferences(
      [
        {
          id: "c-1",
          title: "Todo",
          tasks: [
            {
              id: "t-1",
              text: "Prepare the journey",
              checked: false,
              linkedTasks: [
                {
                  blockId: "block-master",
                  taskId: "task-master",
                  taskNumber: 1,
                },
                {
                  blockId: "missing",
                  taskId: "missing-task",
                  taskNumber: 999,
                },
              ],
            },
          ],
        },
      ],
      [
        {
          blockId: "block-master",
          blockTitle: "Master board",
          columnId: "todo",
          columnTitle: "To do",
          isDone: false,
          taskId: "task-master",
          taskNumber: 33,
          title: "Journey to the west",
          linkedTasks: [],
        },
      ],
    );

    expect(result.changed).toBe(true);
    expect(result.columns[0]?.tasks[0]?.linkedTasks).toEqual([
      {
        blockId: "block-master",
        taskId: "task-master",
        taskNumber: 33,
        title: "Journey to the west",
        blockTitle: "Master board",
      },
    ]);
  });

  it("computes blocked and ready-to-unblock states from dependency links", () => {
    const blockedState = getTaskDependencyState(
      {
        id: "t-1",
        text: "Journey to the west",
        checked: false,
        linkedTasks: [
          {
            blockId: "block-logistics",
            taskId: "task-logistics",
            relationType: "blocked-by",
          },
        ],
      },
      [
        {
          blockId: "block-logistics",
          blockTitle: "Logistics",
          columnId: "todo",
          columnTitle: "To do",
          isDone: false,
          taskId: "task-logistics",
          taskNumber: 114,
          title: "Prepare wagons",
          linkedTasks: [],
        },
      ],
      [],
    );

    expect(blockedState.status).toBe("blocked");
    expect(blockedState.activeBlockers).toHaveLength(1);

    const readyState = getTaskDependencyState(
      {
        id: "t-1",
        text: "Journey to the west",
        checked: false,
        linkedTasks: [
          {
            blockId: "block-logistics",
            taskId: "task-logistics",
            relationType: "blocked-by",
          },
        ],
      },
      [
        {
          blockId: "block-logistics",
          blockTitle: "Logistics",
          columnId: "done",
          columnTitle: "Done",
          isDone: true,
          taskId: "task-logistics",
          taskNumber: 114,
          title: "Prepare wagons",
          linkedTasks: [],
        },
      ],
      [],
    );

    expect(readyState.status).toBe("ready");
    expect(readyState.resolvedBlockers).toHaveLength(1);
  });
});
