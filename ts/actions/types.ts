import type { Kubectl } from "../kubectl";

export type Revert = () => Promise<void>;

export interface MutateDef<Input, Output> {
  readonly type: "mutate";
  readonly name: string;
  readonly mutate: Mutate<Input, Output>;
}

export type Mutate<Input, Output> = (
  deps: Deps
) => (input: Input) => Promise<MutateResult<Output>>;

export interface MutateResult<Output> {
  readonly revert: Revert;
  readonly output: Output;
}

/**
 * A mutate-like action that does not register any revert.
 *
 * Useful for operations that are hard (or impossible) to revert reliably,
 * e.g. applying the `status` subresource.
 */
export interface OneWayMutateDef<Input, Output> {
  readonly type: "oneWayMutate";
  readonly name: string;
  readonly mutate: OneWayMutate<Input, Output>;
}

export type OneWayMutate<Input, Output> = (
  deps: Deps
) => (input: Input) => Promise<Output>;

export interface QueryDef<Input, Output> {
  readonly type: "query";
  readonly name: string;
  readonly query: Query<Input, Output>;
}

export type Query<Input, Output> = (
  deps: Deps
) => (input: Input) => Promise<Output>;

export interface Deps {
  readonly kubectl: Kubectl;
}
