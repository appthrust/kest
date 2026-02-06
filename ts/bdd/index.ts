const given: Fn =
  ({ recorder }) =>
  (description) =>
    recorder.record("BDDGiven", { description });

const when: Fn =
  ({ recorder }) =>
  (description) =>
    recorder.record("BDDWhen", { description });

const then: Fn =
  ({ recorder }) =>
  (description) =>
    recorder.record("BDDThen", { description });

const and: Fn =
  ({ recorder }) =>
  (description) =>
    recorder.record("BDDAnd", { description });

const but: Fn =
  ({ recorder }) =>
  (description) =>
    recorder.record("BDBut", { description });

type Fn = (env: {
  readonly recorder: import("../recording").Recorder;
}) => (description: string) => void;

export default { given, when, then, and, but };
