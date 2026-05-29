type Condition = {
  field: string;
  op: "eq" | "neq" | "contains" | "exists" | "gt" | "lt" | "gte" | "lte";
  value?: unknown;
};

function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce((cur: unknown, key) => {
    if (
      cur !== null &&
      typeof cur === "object" &&
      key in (cur as Record<string, unknown>)
    ) {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evalOne(cond: Condition, actual: unknown): boolean {
  switch (cond.op) {
    case "eq":
      return actual == cond.value; // intentional loose equality
    case "neq":
      return actual != cond.value; // intentional loose inequality
    case "contains":
      return (
        typeof actual === "string" && actual.includes(String(cond.value ?? ""))
      );
    case "exists":
      return actual !== undefined && actual !== null;
    case "gt":
      return Number(actual) > Number(cond.value);
    case "lt":
      return Number(actual) < Number(cond.value);
    case "gte":
      return Number(actual) >= Number(cond.value);
    case "lte":
      return Number(actual) <= Number(cond.value);
    default:
      return false;
  }
}

export function evaluateConditions(
  conditions: Condition[],
  payload: unknown,
): boolean {
  return conditions.every((cond) =>
    evalOne(cond, resolvePath(payload, cond.field)),
  );
}

export function evaluateConditionsDetailed(
  conditions: Condition[],
  payload: unknown,
): { passed: boolean; reason?: string } {
  for (const cond of conditions) {
    const actual = resolvePath(payload, cond.field);
    if (!evalOne(cond, actual)) {
      const got = actual === undefined ? "undefined" : JSON.stringify(actual);
      const reason =
        cond.op === "exists"
          ? `${cond.field}: field not found`
          : `${cond.field} ${cond.op} ${JSON.stringify(
              cond.value,
            )}: got ${got}`;
      return { passed: false, reason };
    }
  }
  return { passed: true };
}
