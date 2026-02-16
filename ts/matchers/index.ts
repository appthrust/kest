import { expect } from "bun:test";
import { toMatchUnordered } from "./to-match-unordered";

expect.extend({ toMatchUnordered });
