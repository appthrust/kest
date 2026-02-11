import { apply } from "../actions/apply";
import {
  type ApplyNamespaceInput,
  applyNamespace,
} from "../actions/apply-namespace";
import { applyStatus } from "../actions/apply-status";
import { assert } from "../actions/assert";
import { assertAbsence } from "../actions/assert-absence";
import { assertList } from "../actions/assert-list";
import { create } from "../actions/create";
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
import type { Recorder } from "../recording";
import type { Reporter } from "../reporter/interface";
import { retryUntil } from "../retry";
import type { Reverting } from "../reverting";

export interface InternalScenario extends Scenario {
  cleanup(): Promise<void>;
  getReport(): Promise<string>;
}

export function createScenario(deps: CreateScenarioOptions): InternalScenario {
  const { recorder, reporter, reverting } = deps;
  return {
    apply: createMutateFn(deps, apply),
    create: createMutateFn(deps, create),
    applyStatus: createOneWayMutateFn(deps, applyStatus),
    delete: createOneWayMutateFn(deps, deleteResource),
    label: createOneWayMutateFn(deps, label),
    exec: createMutateFn(deps, exec),
    get: createQueryFn(deps, get),
    assert: createQueryFn(deps, assert),
    assertAbsence: createQueryFn(deps, assertAbsence),
    assertList: createQueryFn(deps, assertList),
    given: bdd.given(deps),
    when: bdd.when(deps),
    // biome-ignore lint/suspicious/noThenProperty: BDD DSL uses `then()` method name
    then: bdd.then(deps),
    and: bdd.and(deps),
    but: bdd.but(deps),
    newNamespace: createNewNamespaceFn(deps),
    useCluster: createUseClusterFn(deps),
    async cleanup() {
      await reverting.revert();
    },
    async getReport() {
      return await reporter.report(recorder.getEvents());
    },
  };
}

interface CreateScenarioOptions {
  readonly name: string;
  readonly recorder: Recorder;
  readonly kubectl: Kubectl;
  readonly reverting: Reverting;
  readonly reporter: Reporter;
}

const createMutateFn =
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

const createOneWayMutateFn =
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

const createQueryFn =
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

const createNewNamespaceFn =
  (scenarioDeps: CreateScenarioOptions) =>
  async (
    name?: ApplyNamespaceInput,
    options?: undefined | ActionOptions
  ): Promise<Namespace> => {
    const namespaceName = await createMutateFn(scenarioDeps, applyNamespace)(
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
      applyStatus: createOneWayMutateFn(namespacedDeps, applyStatus),
      delete: createOneWayMutateFn(namespacedDeps, deleteResource),
      label: createOneWayMutateFn(namespacedDeps, label),
      get: createQueryFn(namespacedDeps, get),
      assert: createQueryFn(namespacedDeps, assert),
      assertAbsence: createQueryFn(namespacedDeps, assertAbsence),
      assertList: createQueryFn(namespacedDeps, assertList),
    };
  };

const createUseClusterFn =
  (scenarioDeps: CreateScenarioOptions) =>
  // biome-ignore lint/suspicious/useAwait: 将来的にクラスターの接続確認などを行うため、今から async を使用する
  async (cluster: ClusterReference): Promise<Cluster> => {
    const { kubectl } = scenarioDeps;
    const clusterKubectl = kubectl.extends({
      context: cluster.context,
      kubeconfig: cluster.kubeconfig,
    });
    const clusterDeps = { ...scenarioDeps, kubectl: clusterKubectl };
    return {
      apply: createMutateFn(clusterDeps, apply),
      create: createMutateFn(clusterDeps, create),
      applyStatus: createOneWayMutateFn(clusterDeps, applyStatus),
      delete: createOneWayMutateFn(clusterDeps, deleteResource),
      label: createOneWayMutateFn(clusterDeps, label),
      get: createQueryFn(clusterDeps, get),
      assert: createQueryFn(clusterDeps, assert),
      assertAbsence: createQueryFn(clusterDeps, assertAbsence),
      assertList: createQueryFn(clusterDeps, assertList),
      newNamespace: createNewNamespaceFn(clusterDeps),
    };
  };
