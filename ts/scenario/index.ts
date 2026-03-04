import { apply } from "../actions/apply";
import { applyStatus } from "../actions/apply-status";
import { assert } from "../actions/assert";
import { assertAbsence } from "../actions/assert-absence";
import { assertApplyError } from "../actions/assert-apply-error";
import { assertCreateError } from "../actions/assert-create-error";
import { assertList } from "../actions/assert-list";
import { assertOne } from "../actions/assert-one";
import { create } from "../actions/create";
import {
  type CreateNamespaceInput,
  createNamespace,
} from "../actions/create-namespace";
import { deleteResource } from "../actions/delete";
import { exec } from "../actions/exec";
import { get } from "../actions/get";
import { label } from "../actions/label";
import type { MutateDef, OneWayMutateDef, QueryDef } from "../actions/types";
import type {
  ActionOptions,
  Cluster,
  ClusterReference,
  Namespace,
  Scenario,
} from "../apis";
import bdd from "../bdd";
import type { Kubectl } from "../kubectl";
import { generateName as generateRandomName } from "../naming";
import type { Recorder } from "../recording";
import type { Reporter } from "../reporter/interface";
import { retryUntil } from "../retry";
import type { Reverting } from "../reverting";
import { resolveCluster } from "./use-cluster";

export interface InternalScenario extends Scenario {
  cleanup(options?: { skip?: boolean }): Promise<void>;
  getReport(): Promise<string>;
}

export function createScenario(deps: CreateScenarioOptions): InternalScenario {
  const { recorder, reporter, reverting } = deps;
  return {
    apply: createMutateFn(deps, apply),
    create: createMutateFn(deps, create),
    assertApplyError: createMutateFn(deps, assertApplyError),
    assertCreateError: createMutateFn(deps, assertCreateError),
    applyStatus: createOneWayMutateFn(deps, applyStatus),
    delete: createOneWayMutateFn(deps, deleteResource),
    label: createOneWayMutateFn(deps, label),
    exec: createMutateFn(deps, exec),
    get: createQueryFn(deps, get),
    assert: createQueryFn(deps, assert),
    assertAbsence: createQueryFn(deps, assertAbsence),
    assertList: createQueryFn(deps, assertList),
    assertOne: createQueryFn(deps, assertOne),
    given: bdd.given(deps),
    when: bdd.when(deps),
    // biome-ignore lint/suspicious/noThenProperty: BDD DSL uses `then()` method name
    then: bdd.then(deps),
    and: bdd.and(deps),
    but: bdd.but(deps),
    generateName: (prefix: string) => generateRandomName(prefix),
    newNamespace: createNewNamespaceFn(deps),
    useCluster: createUseClusterFn(deps),
    async cleanup(options?: { skip?: boolean }) {
      if (options?.skip) {
        reverting.skip();
      } else {
        await reverting.revert();
      }
    },
    async getReport() {
      return await reporter.report(recorder.getEvents());
    },
  };
}

export interface CreateScenarioOptions {
  readonly name: string;
  readonly recorder: Recorder;
  readonly kubectl: Kubectl;
  readonly reverting: Reverting;
  readonly reporter: Reporter;
}

export const createMutateFn =
  <
    const Action extends MutateDef<Input, Output>,
    Input = Action extends MutateDef<infer I, infer _> ? I : never,
    Output = Action extends MutateDef<infer _, infer O> ? O : never,
  >(
    deps: CreateScenarioOptions,
    action: Action
  ) =>
  async (
    input: Input,
    options?: undefined | ActionOptions
  ): Promise<Output> => {
    const { recorder, kubectl, reverting } = deps;
    const { mutate, describe } = action;
    function recordActionStart() {
      recorder.record("ActionStart", {
        description: describe(input),
      });
    }
    function recordActionEnd(error: undefined | Error) {
      recorder.record("ActionEnd", { ok: error === undefined, error });
    }
    recordActionStart();
    const fn = mutate({ kubectl });
    let mutateErr: undefined | Error;
    try {
      const { revert, output } = await retryUntil(() => fn(input), {
        ...options,
        recorder,
      });
      reverting.add(async () => {
        recordActionStart(); // to record revert action start
        let revertErr: unknown;
        try {
          await revert();
        } catch (err) {
          revertErr = err;
          throw err;
        } finally {
          recordActionEnd(revertErr as Error); // to record revert action end
        }
      });
      return output;
    } catch (error) {
      mutateErr = error as Error;
      throw error;
    } finally {
      recordActionEnd(mutateErr as Error);
    }
  };

export const createOneWayMutateFn =
  <
    const Action extends OneWayMutateDef<Input, Output>,
    Input = Action extends OneWayMutateDef<infer I, infer _> ? I : never,
    Output = Action extends OneWayMutateDef<infer _, infer O> ? O : never,
  >(
    deps: CreateScenarioOptions,
    action: Action
  ) =>
  async (
    input: Input,
    options?: undefined | ActionOptions
  ): Promise<Output> => {
    const { recorder, kubectl } = deps;
    const { mutate, describe } = action;
    recorder.record("ActionStart", { description: describe(input) });
    const fn = mutate({ kubectl });
    let mutateErr: unknown;
    try {
      return await retryUntil(() => fn(input), { ...options, recorder });
    } catch (error) {
      mutateErr = error;
      throw error;
    } finally {
      recorder.record("ActionEnd", {
        ok: mutateErr === undefined,
        error: mutateErr as Error,
      });
    }
  };

export const createQueryFn =
  <
    const Action extends QueryDef<Input, Output>,
    Input = Action extends QueryDef<infer I, infer _> ? I : never,
    Output = Action extends QueryDef<infer _, infer O> ? O : never,
  >(
    deps: CreateScenarioOptions,
    action: Action
  ) =>
  async (
    input: Input,
    options?: undefined | ActionOptions
  ): Promise<Output> => {
    const { recorder, kubectl } = deps;
    const { query, describe } = action;
    recorder.record("ActionStart", { description: describe(input) });
    const fn = query({ kubectl });
    let queryErr: unknown;
    try {
      return await retryUntil(() => fn(input), { ...options, recorder });
    } catch (error) {
      queryErr = error;
      throw error;
    } finally {
      recorder.record("ActionEnd", {
        ok: queryErr === undefined,
        error: queryErr as Error,
      });
    }
  };

export const createNewNamespaceFn =
  (scenarioDeps: CreateScenarioOptions) =>
  async (
    name?: CreateNamespaceInput,
    options?: undefined | ActionOptions
  ): Promise<Namespace> => {
    const namespaceName = await createMutateFn(scenarioDeps, createNamespace)(
      name,
      options
    );
    const { kubectl } = scenarioDeps;
    const namespacedKubectl = kubectl.extends({ namespace: namespaceName });
    const namespacedDeps = { ...scenarioDeps, kubectl: namespacedKubectl };
    return {
      name: namespaceName,
      apply: createMutateFn(namespacedDeps, apply),
      create: createMutateFn(namespacedDeps, create),
      assertApplyError: createMutateFn(namespacedDeps, assertApplyError),
      assertCreateError: createMutateFn(namespacedDeps, assertCreateError),
      applyStatus: createOneWayMutateFn(namespacedDeps, applyStatus),
      delete: createOneWayMutateFn(namespacedDeps, deleteResource),
      label: createOneWayMutateFn(namespacedDeps, label),
      get: createQueryFn(namespacedDeps, get),
      assert: createQueryFn(namespacedDeps, assert),
      assertAbsence: createQueryFn(namespacedDeps, assertAbsence),
      assertList: createQueryFn(namespacedDeps, assertList),
      assertOne: createQueryFn(namespacedDeps, assertOne),
    };
  };

const createUseClusterFn =
  (scenarioDeps: CreateScenarioOptions) =>
  (cluster: ClusterReference, options?: ActionOptions): Promise<Cluster> => {
    return resolveCluster(scenarioDeps, cluster, options);
  };
