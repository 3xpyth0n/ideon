// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import type { BlockData } from "./CanvasBlock";
import AFrameBlock from "./AFrameBlock";

vi.mock("aframe", () => ({}));
vi.mock("aframe-extras/loaders/animation-mixer", () => ({}));

// Shared state so tests can feed canvas nodes into getNodes() / store access.
const flowState = vi.hoisted(() => ({
  nodes: [] as Array<{
    id: string;
    data?: { title?: string };
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  }>,
  subscriptions: new Set<() => void>(),
}));

const dispatchStoreUpdate = () => flowState.subscriptions.forEach((fn) => fn());

const setCenterSpy = vi.hoisted(() => vi.fn());

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    setNodes: vi.fn(),
    getNodes: () => flowState.nodes,
    setCenter: setCenterSpy,
    getViewport: () => ({ zoom: 1 }),
  }),
  // Feed the shared flow state so selector re-reads see node changes between renders.
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ nodes: flowState.nodes, edges: [] }),
  useStoreApi: () => ({
    getState: () => ({ nodes: flowState.nodes, edges: [] }),
    subscribe: (listener: () => void) => {
      flowState.subscriptions.add(listener);
      return () => {
        flowState.subscriptions.delete(listener);
      };
    },
  }),
  useViewport: () => ({ zoom: 1 }),
  useNodeId: () => undefined,
  NodeResizer: () => null,
  NodeResizeControl: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));
vi.mock("@providers/I18nProvider", () => ({
  useI18n: () => ({
    dict: {
      blocks: {
        blockType3DScene: "3D Scene",
        blockType3DSceneEmpty: "Empty scene",
        blockType3DSceneFallback:
          "Add primitives or load a model to get started.",
        blockType3DSceneEditor: "Scene editor",
        blockType3DSceneHotspotTarget: "Hotspot target block",
        blockType3DSceneHotspotNoTarget: "No block",
        blockType3DSceneHotspotDeleted: "Deleted block",
        blockType3DSceneDetails: "Details",
        blockType3DScenePosition: "Position",
        blockType3DSceneSize: "Size",
        uploadFile: "Upload File",
        uploadError: "Upload failed",
      },
      common: {
        error: "Error",
        delete: "Delete",
        edit: "Edit",
      },
      project: { anonymous: "Anonymous" },
    },
    lang: "en",
  }),
}));
vi.mock("./BlockFooter", () => ({ BlockFooter: () => null }));
vi.mock("./BlockTitleInput", () => ({ BlockTitleInput: () => null }));
vi.mock("./BlockReactions", () => ({ BlockReactions: () => null }));
vi.mock("./hooks/useBlockReactions", () => ({
  useBlockReactions: () => ({
    handleReact: vi.fn(),
    handleRemoveReaction: vi.fn(),
  }),
}));
vi.mock("./utils/focusCanvas", () => ({ focusProjectCanvas: vi.fn() }));

const makeData = (
  metadata: string | Record<string, unknown>,
  overrides: Partial<BlockData> = {},
): BlockData => ({
  blockType: "aframe",
  title: "Scene",
  content: "",
  metadata,
  ownerId: "u1",
  projectOwnerId: "u1",
  isLocked: false,
  currentUser: undefined,
  updatedAt: "2026-01-01T00:00:00Z",
  authorName: "A",
  lastEditor: "A",
  reactions: [],
  onContentChange: vi.fn(),
  onResizeEnd: vi.fn(),
  ...overrides,
});

const renderBlock = (data: BlockData) =>
  render(
    <AFrameBlock
      id="b1"
      data={data}
      selected={false}
      type="core"
      dragging={false}
      zIndex={0}
      selectable={true}
      deletable={true}
      draggable={true}
      isConnectable={true}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
    />,
  );

describe("AFrameBlock", () => {
  it("renders the empty-scene state", () => {
    const { container } = renderBlock(makeData("{}"));
    expect(screen.getByText("Empty scene")).toBeTruthy();
    expect(screen.getByText("3D Scene")).toBeTruthy();
    expect(container.querySelector("a-scene")).toBeNull();
  });

  it("embeds the scene and maps the torus tubular radius via a dashed attribute", () => {
    const { container } = renderBlock(
      makeData({
        primitives: [
          { type: "torus", tubular: 0.25, radius: 0.5, position: [0, 1.6, -4] },
        ],
      }),
    );

    const scene = container.querySelector("a-scene");
    expect(scene?.hasAttribute("embedded")).toBe(true);
    const torus = container.querySelector("a-torus");
    expect(torus?.getAttribute("radius-tubular")).toBe("0.25");
  });

  it("applies the uploaded image as the plane texture", () => {
    const { container } = renderBlock(
      makeData({
        assets: [
          {
            id: "a1",
            url: "/api/projects/p1/files?name=cat.png",
            type: "image",
            label: "cat.png",
            position: [0, 0, 0],
          },
        ],
      }),
    );

    const plane = container.querySelector("a-plane");
    expect(plane?.getAttribute("material")).toBe(
      "shader: flat; side: double; src: /api/projects/p1/files?name=cat.png",
    );
  });

  afterEach(() => {
    cleanup();
    flowState.nodes = [];
    flowState.subscriptions.clear();
    setCenterSpy.mockClear();
  });

  it("attributes edits to the current user instead of Anonymous", () => {
    const onContentChange = vi.fn();
    renderBlock(
      makeData(
        { primitives: [] },
        {
          currentUser: { id: "u1", username: "Saad" },
          onContentChange,
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByText("Box"));

    expect(onContentChange).toHaveBeenCalled();
    const call = onContentChange.mock.calls.at(-1);
    expect(call?.[3]).toBe("Saad");
  });

  it("lets a hotspot be bound to a canvas block in the editor", () => {
    const onContentChange = vi.fn();
    flowState.nodes = [{ id: "t1", data: { title: "Note A" } }];
    renderBlock(
      makeData(
        { hotspots: [{ blockId: "", label: "", position: [0, 1.6, -4] }] },
        {
          currentUser: { id: "u1", username: "Saad" },
          onContentChange,
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    const select = screen.getByTitle("Hotspot target block");
    fireEvent.change(select, { target: { value: "t1" } });

    expect(onContentChange).toHaveBeenCalled();
    const call = onContentChange.mock.calls.at(-1);
    const meta = JSON.parse(call?.[4] as string) as {
      hotspots: Array<{ blockId: string }>;
    };
    expect(meta.hotspots[0].blockId).toBe("t1");
  });

  it("refreshes hotspot targets when collaborators change the canvas while the editor is open", () => {
    flowState.nodes = [{ id: "t1", data: { title: "Note A" } }];
    const data = makeData(
      { hotspots: [{ blockId: "", label: "", position: [0, 1.6, -4] }] },
      {
        currentUser: { id: "u1", username: "Saad" },
      },
    );
    const { rerender } = render(
      <AFrameBlock
        id="b1"
        data={data}
        selected={false}
        type="core"
        dragging={false}
        zIndex={0}
        selectable={true}
        deletable={true}
        draggable={true}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    );

    fireEvent.click(screen.getByTitle("Edit"));
    const select = screen.getByTitle(
      "Hotspot target block",
    ) as HTMLSelectElement;
    expect(
      Array.from(select.querySelectorAll("option")).some(
        (option) => option.textContent === "Note A",
      ),
    ).toBe(true);

    // Collaborator adds a block while the editor is open; dispatch mimics the store subscription.
    flowState.nodes = [
      { id: "t1", data: { title: "Note A" } },
      { id: "t2", data: { title: "Note B" } },
    ];
    rerender(
      <AFrameBlock
        id="b1"
        data={{ ...data }}
        selected={false}
        type="core"
        dragging={false}
        zIndex={0}
        selectable={true}
        deletable={true}
        draggable={true}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    );

    expect(
      Array.from(select.querySelectorAll("option")).some(
        (option) => option.textContent === "Note B",
      ),
    ).toBe(true);
  });

  it("shows a deleted-block placeholder when a hotspot's bound block no longer exists", () => {
    flowState.nodes = [{ id: "t1", data: { title: "Note A" } }];
    const onContentChange = vi.fn();
    renderBlock(
      makeData(
        { hotspots: [{ blockId: "gone", label: "", position: [0, 1.6, -4] }] },
        {
          currentUser: { id: "u1", username: "Saad" },
          onContentChange,
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    const select = screen.getByTitle(
      "Hotspot target block",
    ) as HTMLSelectElement;

    const staleOption = select.querySelector<HTMLSelectElement>(
      'option[value="gone"]',
    );
    expect(staleOption).not.toBeNull();
    expect(staleOption?.textContent).toBe("Deleted block");
    expect(select.value).toBe("gone");

    // Re-binding recovers: the stale option disappears on change.
    fireEvent.change(select, { target: { value: "t1" } });
    const meta = JSON.parse(onContentChange.mock.lastCall?.[4] as string) as {
      hotspots: Array<{ blockId: string }>;
    };
    expect(meta.hotspots[0].blockId).toBe("t1");
  });

  it("composes editor writes onto pending metadata within the same frame", () => {
    const onContentChange = vi.fn();
    renderBlock(
      makeData(
        { primitives: [] },
        {
          currentUser: { id: "u1", username: "Saad" },
          onContentChange,
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    // Second write must compose over the first, not over the render-time snapshot.
    fireEvent.click(screen.getByText("Box"));
    fireEvent.click(screen.getByText("Sphere"));

    expect(onContentChange).toHaveBeenCalledTimes(2);
    const meta = JSON.parse(onContentChange.mock.lastCall?.[4] as string) as {
      primitives: Array<{ type: string; position: number[] }>;
    };
    expect(meta.primitives.map((p) => p.type)).toEqual(["box", "sphere"]);
    // Same-frame adds must also land side by side, not on the same spot.
    expect(meta.primitives.map((p) => p.position)).toEqual([
      [-1.5, 1.6, -4],
      [0, 1.6, -4],
    ]);
  });

  it("spawns new primitives into free slots instead of occupied ones", () => {
    const onContentChange = vi.fn();
    renderBlock(
      makeData(
        {
          primitives: [{ type: "sphere", position: [0, 1.6, -4] }],
          hotspots: [{ blockId: "", label: "", position: [-1.5, 1.6, -4] }],
        },
        {
          currentUser: { id: "u1", username: "Saad" },
          onContentChange,
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    // Sphere and hotspot occupy slots 0 and 1; the box must take the next one.
    fireEvent.click(screen.getByText("Box"));

    const meta = JSON.parse(onContentChange.mock.lastCall?.[4] as string) as {
      primitives: Array<{ position: number[] }>;
    };
    expect(meta.primitives).toHaveLength(2);
    expect(meta.primitives[1].position).toEqual([1.5, 1.6, -4]);
  });

  it("edits primitive position and size through the Details panel", () => {
    const onContentChange = vi.fn();
    renderBlock(
      makeData(
        {
          primitives: [
            {
              id: "prim-1",
              type: "box",
              position: [0, 1.6, -4],
              color: "#4CC3D9",
            },
          ],
        },
        {
          currentUser: { id: "u1", username: "Saad" },
          onContentChange,
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByTitle("Details"));

    // Moving X then Y composes into one final position.
    fireEvent.change(screen.getByTitle("Position X"), {
      target: { value: "1" },
    });
    fireEvent.blur(screen.getByTitle("Position X"));
    fireEvent.change(screen.getByTitle("Position Y"), {
      target: { value: "2.5" },
    });
    fireEvent.blur(screen.getByTitle("Position Y"));

    let meta = JSON.parse(onContentChange.mock.lastCall?.[4] as string) as {
      primitives: Array<{ position: number[]; width?: number }>;
    };
    expect(meta.primitives[0].position).toEqual([1, 2.5, -4]);

    // Size editing: W=0.8 commits; zero or invalid entries are rejected.
    const writesBefore = onContentChange.mock.calls.length;
    fireEvent.change(screen.getByTitle("W"), {
      target: { value: "0.8" },
    });
    fireEvent.blur(screen.getByTitle("W"));
    fireEvent.change(screen.getByTitle("W"), {
      target: { value: "0" },
    });
    fireEvent.blur(screen.getByTitle("W"));

    meta = JSON.parse(onContentChange.mock.lastCall?.[4] as string) as {
      primitives: Array<{ position: number[]; width?: number }>;
    };
    expect(onContentChange.mock.calls.length).toBe(writesBefore + 1);
    expect(meta.primitives[0].width).toBe(0.8);
    // The rejected W edit must not have discarded the earlier edits.
    expect(meta.primitives[0].position).toEqual([1, 2.5, -4]);
  });

  it("commits position edits live while typing, without blur or Enter", () => {
    const onContentChange = vi.fn();
    renderBlock(
      makeData(
        {
          primitives: [
            {
              id: "prim-1",
              type: "box",
              position: [0, 1.6, -4],
              color: "#4CC3D9",
            },
          ],
        },
        {
          currentUser: { id: "u1", username: "Saad" },
          onContentChange,
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByTitle("Details"));

    const input = screen.getByTitle("Position X") as HTMLInputElement;

    // The change event alone commits: the scene follows while typing.
    fireEvent.change(input, { target: { value: "1" } });
    expect(onContentChange).toHaveBeenCalled();
    const afterOne = JSON.parse(
      onContentChange.mock.lastCall?.[4] as string,
    ) as { primitives: Array<{ position: number[] }> };
    expect(afterOne.primitives[0].position).toEqual([1, 1.6, -4]);

    // Asserts display only; a re-read round trip would parse and re-commit the value.
    fireEvent.change(input, { target: { value: "1." } });
    expect(input.value).toBe("1.");

    fireEvent.change(input, { target: { value: "1.5" } });
    const final = JSON.parse(onContentChange.mock.lastCall?.[4] as string) as {
      primitives: Array<{ position: number[] }>;
    };
    expect(final.primitives[0].position).toEqual([1.5, 1.6, -4]);
  });

  it("repaints scene entities when edited metadata round-trips through data", () => {
    const data = makeData(
      {
        primitives: [
          {
            id: "prim-1",
            type: "box",
            position: [0, 1.6, -4],
            width: 1,
            height: 1,
            depth: 1,
            color: "#4CC3D9",
          },
        ],
      },
      { currentUser: { id: "u1", username: "Saad" } },
    );
    const { rerender, container } = renderBlock(data);

    // DOM order: camera wrapper is first a-entity, the primitive is its child container.
    const getPrimEntity = (root: HTMLElement) =>
      Array.from(root.querySelectorAll("a-entity")).find((el) =>
        el.querySelector("a-box"),
      );

    expect(getPrimEntity(container)?.getAttribute("position")).toBe("0 1.6 -4");
    expect(
      getPrimEntity(container)?.querySelector("a-box")?.getAttribute("width"),
    ).toBe("1");

    // Optimistic update arrives: same entity carries the new attrs without remount.
    const updated = makeData(
      {
        primitives: [
          {
            id: "prim-1",
            type: "box",
            position: [1, 2.5, -4],
            width: 0.8,
            height: 1,
            depth: 1,
            color: "#4CC3D9",
          },
        ],
      },
      { currentUser: { id: "u1", username: "Saad" } },
    );
    rerender(
      <AFrameBlock
        id="b1"
        data={updated}
        selected={false}
        type="core"
        dragging={false}
        zIndex={0}
        selectable={true}
        deletable={true}
        draggable={true}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    );

    expect(getPrimEntity(container)?.getAttribute("position")).toBe("1 2.5 -4");
    expect(
      getPrimEntity(container)?.querySelector("a-box")?.getAttribute("width"),
    ).toBe("0.8");
  });

  it("tints hotspot bindings whose target block no longer exists", () => {
    flowState.nodes = [
      { id: "t1", data: { title: "Note A" } },
      { id: "t2", data: { title: "Note B" } },
    ];
    const { container } = renderBlock(
      makeData({
        hotspots: [
          { blockId: "t1", label: "A", position: [0, 1.6, -4] },
          { blockId: "t2", label: "B", position: [1.5, 1.6, -4] },
        ],
      }),
    );

    // Only hotspot entities carry a material attribute here.
    const getHotspotMaterials = () =>
      Array.from(container.querySelectorAll("a-entity"))
        .map((el) => el.getAttribute("material") ?? "")
        .filter((material) => material.startsWith("color:"));

    expect(getHotspotMaterials()).toEqual([
      "color: #3b82f6; shader: flat",
      "color: #3b82f6; shader: flat",
    ]);

    // Store update flips "t2" to dangling while "t1" stays bound.
    flowState.nodes = [{ id: "t1", data: { title: "Note A" } }];
    act(() => {
      dispatchStoreUpdate();
    });

    expect(getHotspotMaterials()).toEqual([
      "color: #3b82f6; shader: flat",
      "color: #ef4444; shader: flat",
    ]);
  });

  it("keeps the scene editor open while interacting inside the block card", () => {
    renderBlock(
      makeData(
        { primitives: [] },
        { currentUser: { id: "u1", username: "Saad" } },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    expect(screen.getByText("Scene editor")).toBeTruthy();

    const card = screen.getByText("3D Scene").closest(".block-card");
    expect(card).not.toBeNull();
    fireEvent.pointerDown(card!);
    fireEvent.pointerDown(screen.getByText("Scene editor"));

    expect(screen.getByText("Scene editor")).toBeTruthy();
  });

  it("closes the scene editor when the user interacts outside the block card", () => {
    renderBlock(
      makeData(
        { primitives: [] },
        { currentUser: { id: "u1", username: "Saad" } },
      ),
    );

    fireEvent.click(screen.getByTitle("Edit"));
    expect(screen.getByText("Scene editor")).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByText("Scene editor")).toBeNull();

    // Reopening works after the outside-click dismissal.
    fireEvent.click(screen.getByTitle("Edit"));
    expect(screen.getByText("Scene editor")).toBeTruthy();
  });

  it("renders hotspot labels as clickable chips that navigate to the target block", () => {
    flowState.nodes = [
      {
        id: "t1",
        data: { title: "Note A" },
        position: { x: 10, y: 20 },
        width: 100,
        height: 50,
      },
    ];
    renderBlock(
      makeData(
        {
          hotspots: [
            {
              id: "hs-1",
              blockId: "t1",
              label: "Pin A",
              position: [0, 1.6, -4],
            },
          ],
        },
        { currentUser: { id: "u1", username: "Saad" } },
      ),
    );

    // Label is a DOM chip; in-scene text vanishes when A-Frame's CDN font fails.
    const chip = screen.getByRole("button", { name: /Pin A/ });
    fireEvent.click(chip);

    // Navigation centers on the target block (x + width/2, y + height/2), current zoom kept.
    expect(setCenterSpy).toHaveBeenCalledWith(60, 45, {
      duration: 800,
      zoom: 1,
    });
  });
});
