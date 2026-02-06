# Example: applies ConfigMap using YAML, file import, and object literal

## Scenario Overview

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Create namespace | kest-9hdhj | ✅ |
| 2 | Apply | ConfigMap/my-config-1 | ✅ |
| 3 | Apply | ConfigMap/my-config-2 | ✅ |
| 4 | Apply | ConfigMap/my-config-3 | ✅ |
| 5 | Assert | ConfigMap/my-config-1 | ✅ |

## Scenario Details

### Given: a new namespace exists

**✅ Create Namespace "kest-9hdhj"**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata: 
  name: kest-9hdhj

EOF
```

```text title="stdout"
namespace/kest-9hdhj created
```

### When: I apply ConfigMaps using different formats

**✅ Apply ConfigMap "my-config-1" in namespace "kest-9hdhj"**

```shell
kubectl apply -f - -n kest-9hdhj <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-1
data: 
  mode: demo-1

EOF
```

```text title="stdout"
configmap/my-config-1 created
```

**✅ Apply ConfigMap "my-config-2" in namespace "kest-9hdhj"**

```shell
kubectl apply -f - -n kest-9hdhj <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-2
data: 
  mode: demo-2

EOF
```

```text title="stdout"
configmap/my-config-2 created
```

**✅ Apply ConfigMap "my-config-3" in namespace "kest-9hdhj"**

```shell
kubectl apply -f - -n kest-9hdhj <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-3
data: 
  mode: demo-3

EOF
```

```text title="stdout"
configmap/my-config-3 created
```

### Then: the ConfigMap should have the expected data

**✅ Assert ConfigMap "my-config-1" in namespace "kest-9hdhj"**

```shell
kubectl get ConfigMap my-config-1 -o yaml -n kest-9hdhj
```

```yaml title="stdout"
apiVersion: v1
data:
  mode: demo-1
kind: ConfigMap
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"v1","data":{"mode":"demo-1"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-1","namespace":"kest-9hdhj"}}
  creationTimestamp: "2026-02-06T00:27:52Z"
  name: my-config-1
  namespace: kest-9hdhj
  resourceVersion: "487392"
  uid: c55d94fa-7096-4534-84ef-88a4e384da24
```

### Cleanup

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Delete | ConfigMap/my-config-3 | ✅ |
| 2 | Delete | ConfigMap/my-config-2 | ✅ |
| 3 | Delete | ConfigMap/my-config-1 | ✅ |
| 4 | Delete namespace | kest-9hdhj | ✅ |

```shellsession
$ kubectl delete ConfigMap/my-config-3 -n kest-9hdhj
configmap "my-config-3" deleted from kest-9hdhj namespace

$ kubectl delete ConfigMap/my-config-2 -n kest-9hdhj
configmap "my-config-2" deleted from kest-9hdhj namespace

$ kubectl delete ConfigMap/my-config-1 -n kest-9hdhj
configmap "my-config-1" deleted from kest-9hdhj namespace

$ kubectl delete Namespace/kest-9hdhj
namespace "kest-9hdhj" deleted
```

# Example: asserts a non-existent ConfigMap (expected to fail)

## Scenario Overview

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Create namespace | kest-k515q | ✅ |
| 2 | Assert | ConfigMap/non-existent-config | ❌ |

## Scenario Details

### Given: a new namespace exists

**✅ Create Namespace "kest-k515q"**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata: 
  name: kest-k515q

EOF
```

```text title="stdout"
namespace/kest-k515q created
```

### Then: asserting a non-existent ConfigMap should fail

**❌ Assert ConfigMap "non-existent-config" in namespace "kest-k515q"** (Failed after 20 attempts)

```shell
kubectl get ConfigMap non-existent-config -o yaml -n kest-k515q
```

```text title="stderr"
Error from server (NotFound): configmaps "non-existent-config" not found
```

Error:

```text
kubectl get failed (exit code 1): Error from server (NotFound): configmaps "non-existent-config" not found

Trace:
    at runKubectl (/Users/suin/codes/github.com/appthrust/kest/ts/kubectl/index.ts:316:17)
    at async get (/Users/suin/codes/github.com/appthrust/kest/ts/kubectl/index.ts:223:23)
    at async <anonymous> (/Users/suin/codes/github.com/appthrust/kest/ts/actions/assert.ts:11:34)
    at async retryUntil (/Users/suin/codes/github.com/appthrust/kest/ts/retry.ts:83:27)
    at async <anonymous> (/Users/suin/codes/github.com/appthrust/kest/ts/scenario/index.ts:168:20)
    at async <anonymous> (/Users/suin/codes/github.com/appthrust/kest/example/example.test.ts:69:12)
    at async <anonymous> (/Users/suin/codes/github.com/appthrust/kest/ts/test.ts:65:15)
    at processTicksAndRejections (unknown:7:39)
```

### Cleanup

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Delete namespace | kest-k515q | ✅ |

```shellsession
$ kubectl delete Namespace/kest-k515q
namespace "kest-k515q" deleted
```

# Example: manages resources across multiple clusters

## Scenario Overview

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Apply | ConfigMap/my-config-1 | ✅ |
| 2 | Apply | ConfigMap/my-config-2 | ✅ |
| 3 | Assert | ConfigMap/my-config-1 | ✅ |
| 4 | Assert | ConfigMap/my-config-2 | ✅ |

## Scenario Details

### When: I apply ConfigMaps to each cluster

**✅ Apply ConfigMap "my-config-1"**

```shell
kubectl apply -f - --context kind-kest-test-cluster-1 --kubeconfig .kubeconfig.yaml <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-1
data: 
  mode: demo-1

EOF
```

```text title="stdout"
configmap/my-config-1 created
```

**✅ Apply ConfigMap "my-config-2"**

```shell
kubectl apply -f - --context kind-kest-test-cluster-2 <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-2
data: 
  mode: demo-2

EOF
```

```text title="stdout"
configmap/my-config-2 created
```

### Then: each cluster should have its ConfigMap

**✅ Assert ConfigMap "my-config-1"**

```shell
kubectl get ConfigMap my-config-1 -o yaml --context kind-kest-test-cluster-1 --kubeconfig .kubeconfig.yaml
```

```yaml title="stdout"
apiVersion: v1
data:
  mode: demo-1
kind: ConfigMap
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"v1","data":{"mode":"demo-1"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-1","namespace":"default"}}
  creationTimestamp: "2026-02-06T00:27:58Z"
  name: my-config-1
  namespace: default
  resourceVersion: "487408"
  uid: 3747a790-9971-4d5a-95ad-a27a81a816f6
```

**✅ Assert ConfigMap "my-config-2"**

```shell
kubectl get ConfigMap my-config-2 -o yaml --context kind-kest-test-cluster-2
```

```yaml title="stdout"
apiVersion: v1
data:
  mode: demo-2
kind: ConfigMap
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"v1","data":{"mode":"demo-2"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-2","namespace":"default"}}
  creationTimestamp: "2026-02-06T00:27:58Z"
  name: my-config-2
  namespace: default
  resourceVersion: "485245"
  uid: d79c985c-4c4c-4f89-9ec6-7f4a9d675e42
```

### Cleanup

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Delete | ConfigMap/my-config-2 | ✅ |
| 2 | Delete | ConfigMap/my-config-1 | ✅ |

```shellsession
$ kubectl delete ConfigMap/my-config-2 --context kind-kest-test-cluster-2
configmap "my-config-2" deleted from default namespace

$ kubectl delete ConfigMap/my-config-1 --context kind-kest-test-cluster-1 --kubeconfig .kubeconfig.yaml
configmap "my-config-1" deleted from default namespace
```

# Example: executes shell commands with revert cleanup

## Scenario Overview

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Exec | N/A | ✅ |

## Scenario Details

### Cleanup

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Exec | N/A | ✅ |

# Example: asserts resource presence and absence in a list

## Scenario Overview

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Create namespace | kest-cld1c | ✅ |
| 2 | Apply | ConfigMap/my-config-1 | ✅ |
| 3 | AssertList | ConfigMap | ✅ |

## Scenario Details

### Given: a new namespace exists

**✅ Create Namespace "kest-cld1c"**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata: 
  name: kest-cld1c

EOF
```

```text title="stdout"
namespace/kest-cld1c created
```

### When: I apply a single ConfigMap

**✅ Apply ConfigMap "my-config-1" in namespace "kest-cld1c"**

```shell
kubectl apply -f - -n kest-cld1c <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-1
data: 
  mode: demo-1

EOF
```

```text title="stdout"
configmap/my-config-1 created
```

### Then: the list should contain only the applied ConfigMap

**✅ AssertList ConfigMap in namespace "kest-cld1c"**

```shell
kubectl get ConfigMap -o yaml -n kest-cld1c
```

```yaml title="stdout"
apiVersion: v1
items:
- apiVersion: v1
  data:
    ca.crt: |
      -----BEGIN CERTIFICATE-----
      MIIDBTCCAe2gAwIBAgIIVDHmGXfVRt4wDQYJKoZIhvcNAQELBQAwFTETMBEGA1UE
      AxMKa3ViZXJuZXRlczAeFw0yNjAxMzEwMTEwMzBaFw0zNjAxMjkwMTE1MzBaMBUx
      EzARBgNVBAMTCmt1YmVybmV0ZXMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
      AoIBAQC6b/cTN1kRXpFlzHMTO+KZQGkG0T49Jp/MkbSSDyieRJi3AK8KG1v2xMD5
      CVMDba2oH+Cn4JdZ5ixhOJ4PRP4DUjVYvHWp6Em9n1VtB4QyX9QzJBBsu+0y+vNh
      qGW2TbAcH7BfZi+Gxjrb98QbWbhg1d0drDqyTzA/yrbhRqEX1GwGb//VF06CCp5n
      qktPSZsS265elmQoip5leaM+5hX3CbZvLVWpx5b964VJIuxNodgYVKNfg5K6Dogm
      gjcSNrrJ6e0cszwuYVC0OQFnAThOXwXLyeLnSmgHuRb0tzP/SmWWLXm2SX05uPb9
      vHqVoopdNURi82g1vplP/rb45TA9AgMBAAGjWTBXMA4GA1UdDwEB/wQEAwICpDAP
      BgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBRK0TknEEFFUSqlS2q4/K48/+GoSTAV
      BgNVHREEDjAMggprdWJlcm5ldGVzMA0GCSqGSIb3DQEBCwUAA4IBAQAguduQSX4i
      ONrSF15diokMuY1+3NY+xufuIFZ8rT5mhZF5cJjt9Av0s9fqDr7urI48a4BCO4Bv
      mdB0hwsn/rKNYx7FgQyyAF1MXEywXjR66tNwCCAibRNs0k6rrWZ0hMvlNB0PkDpE
      VtLYqjN9hzOzBvYKkNoTgAbt510iTPGyQaLlloJYWonsUZOHaYmLrksPAKa6l+WT
      SyNvFcOTgYUXcwTHXDdXN8/nWJy9v9lWGPzyFbA5C0jUvfoWDIejRgxnOS7Tm6Qe
      NU5rKBlVqheAqx+T6toLdlkgOs1wRJQlqu0XO4FcfoYDCUTMW41DeO45i54Ql8rQ
      lAJH8vYIQyps
      -----END CERTIFICATE-----
  kind: ConfigMap
  metadata:
    annotations:
      kubernetes.io/description: Contains a CA bundle that can be used to verify the
        kube-apiserver when using internal endpoints such as the internal service
        IP or kubernetes.default.svc. No other usage is guaranteed across distributions
        of Kubernetes clusters.
    creationTimestamp: "2026-02-06T00:27:58Z"
    name: kube-root-ca.crt
    namespace: kest-cld1c
    resourceVersion: "487416"
    uid: b60235f4-685c-4845-a143-bf89897c801c
- apiVersion: v1
  data:
    mode: demo-1
  kind: ConfigMap
  metadata:
    annotations:
      kubectl.kubernetes.io/last-applied-configuration: |
        {"apiVersion":"v1","data":{"mode":"demo-1"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-1","namespace":"kest-cld1c"}}
    creationTimestamp: "2026-02-06T00:27:58Z"
    name: my-config-1
    namespace: kest-cld1c
    resourceVersion: "487417"
    uid: 45e6c2a5-e745-408f-a4dd-b8ca671411c6
kind: List
metadata:
  resourceVersion: ""
```

### Cleanup

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Delete | ConfigMap/my-config-1 | ✅ |
| 2 | Delete namespace | kest-cld1c | ✅ |

```shellsession
$ kubectl delete ConfigMap/my-config-1 -n kest-cld1c
configmap "my-config-1" deleted from kest-cld1c namespace

$ kubectl delete Namespace/kest-cld1c
namespace "kest-cld1c" deleted
```

# Example: applies status subresource to custom resource

## Scenario Overview

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Apply | CustomResourceDefinition/helloworlds.example.com | ✅ |
| 2 | Create namespace | kest-1j79x | ✅ |
| 3 | Apply | HelloWorld/my-hello-world | ✅ |
| 4 | ApplyStatus | HelloWorld/my-hello-world | ✅ |
| 5 | Assert | HelloWorld/my-hello-world | ✅ |

## Scenario Details

### Given: a HelloWorld custom resource definition exists

**✅ Apply CustomResourceDefinition "helloworlds.example.com"**

```shell
kubectl apply -f - <<EOF
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: 
  name: helloworlds.example.com
spec: 
  group: example.com
  names: 
    kind: HelloWorld
    listKind: HelloWorldList
    plural: helloworlds
    singular: helloworld
  scope: Namespaced
  versions: 
    - name: v1
      served: true
      storage: true
      subresources: 
        status: 
          {}
      schema: 
        openAPIV3Schema: 
          type: object
          properties: 
            apiVersion: 
              type: string
            kind: 
              type: string
            metadata: 
              type: object
            status: 
              description: HelloWorldStatus defines the observed state of HelloWorld.
              type: object
              properties: 
                conditions: 
                  description: "Conditions represent the latest available observations of an object's state."
                  type: array
                  x-kubernetes-list-type: map
                  x-kubernetes-list-map-keys: 
                    - type
                  items: 
                    description: Condition contains details for one aspect of the current state of this API Resource.
                    type: object
                    required: 
                      - type
                      - status
                      - lastTransitionTime
                      - reason
                      - message
                    properties: 
                      type: 
                        description: Type of condition in CamelCase or in foo.example.com/CamelCase.
                        type: string
                        maxLength: 316
                        pattern: "^[A-Za-z0-9]([A-Za-z0-9_.-]*[A-Za-z0-9])?$"
                      status: 
                        description: "Status of the condition, one of True, False, Unknown."
                        type: string
                        enum: 
                          - "True"
                          - "False"
                          - Unknown
                      observedGeneration: 
                        description: observedGeneration represents the .metadata.generation that the condition was set based upon.
                        type: integer
                        format: int64
                        minimum: 0
                      lastTransitionTime: 
                        description: lastTransitionTime is the last time the condition transitioned from one status to another.
                        type: string
                        format: date-time
                      reason: 
                        description: "reason contains a programmatic identifier indicating the reason for the condition's last transition."
                        type: string
                        minLength: 1
                        maxLength: 1024
                        pattern: "^[A-Za-z]([A-Za-z0-9_,:]*[A-Za-z0-9_])?$"
                      message: 
                        description: message is a human readable message indicating details about the transition.
                        type: string
                        maxLength: 32768
    - name: v2
      served: true
      storage: false
      subresources: 
        status: 
          {}
      schema: 
        openAPIV3Schema: 
          type: object
          properties: 
            apiVersion: 
              type: string
            kind: 
              type: string
            metadata: 
              type: object
            status: 
              description: HelloWorldStatus defines the observed state of HelloWorld.
              type: object
              properties: 
                conditions: 
                  description: "Conditions represent the latest available observations of an object's state."
                  type: array
                  x-kubernetes-list-type: map
                  x-kubernetes-list-map-keys: 
                    - type
                  items: 
                    description: Condition contains details for one aspect of the current state of this API Resource.
                    type: object
                    required: 
                      - type
                      - status
                      - lastTransitionTime
                      - reason
                      - message
                    properties: 
                      type: 
                        description: Type of condition in CamelCase or in foo.example.com/CamelCase.
                        type: string
                        maxLength: 316
                        pattern: "^[A-Za-z0-9]([A-Za-z0-9_.-]*[A-Za-z0-9])?$"
                      status: 
                        description: "Status of the condition, one of True, False, Unknown."
                        type: string
                        enum: 
                          - "True"
                          - "False"
                          - Unknown
                      observedGeneration: 
                        description: observedGeneration represents the .metadata.generation that the condition was set based upon.
                        type: integer
                        format: int64
                        minimum: 0
                      lastTransitionTime: 
                        description: lastTransitionTime is the last time the condition transitioned from one status to another.
                        type: string
                        format: date-time
                      reason: 
                        description: "reason contains a programmatic identifier indicating the reason for the condition's last transition."
                        type: string
                        minLength: 1
                        maxLength: 1024
                        pattern: "^[A-Za-z]([A-Za-z0-9_,:]*[A-Za-z0-9_])?$"
                      message: 
                        description: message is a human readable message indicating details about the transition.
                        type: string
                        maxLength: 32768

EOF
```

```text title="stdout"
customresourcedefinition.apiextensions.k8s.io/helloworlds.example.com created
```

### Given: a new namespace exists

**✅ Create Namespace "kest-1j79x"**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata: 
  name: kest-1j79x

EOF
```

```text title="stdout"
namespace/kest-1j79x created
```

### Given: a HelloWorld custom resource is created

**✅ Apply HelloWorld "my-hello-world" in namespace "kest-1j79x"**

```shell
kubectl apply -f - -n kest-1j79x <<EOF
apiVersion: example.com/v2
kind: HelloWorld
metadata: 
  name: my-hello-world

EOF
```

```text title="stdout"
helloworld.example.com/my-hello-world created
```

### When: I apply a status with Ready condition

**✅ ApplyStatus HelloWorld "my-hello-world" in namespace "kest-1j79x"**

```shell
kubectl apply --server-side --field-manager kest --subresource=status -f - -n kest-1j79x <<EOF
apiVersion: example.com/v2
kind: HelloWorld
metadata: 
  name: my-hello-world
status: 
  conditions: 
    - type: Ready
      status: "True"
      lastTransitionTime: 2026-02-05T00:00:00Z
      reason: ManuallySet
      message: Ready condition set to True via server-side apply.

EOF
```

```text title="stdout"
helloworld.example.com/my-hello-world serverside-applied
```

### Then: the HelloWorld should have the Ready status

**✅ Assert HelloWorld "my-hello-world" in namespace "kest-1j79x"**

```shell
kubectl get HelloWorld.v2.example.com my-hello-world -o yaml -n kest-1j79x
```

```yaml title="stdout"
apiVersion: example.com/v2
kind: HelloWorld
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"example.com/v2","kind":"HelloWorld","metadata":{"annotations":{},"name":"my-hello-world","namespace":"kest-1j79x"}}
  creationTimestamp: "2026-02-06T00:28:06Z"
  generation: 1
  name: my-hello-world
  namespace: kest-1j79x
  resourceVersion: "487441"
  uid: 681105e4-0004-4bf4-a6b2-68fe5320e5d5
status:
  conditions:
  - lastTransitionTime: "2026-02-05T00:00:00Z"
    message: Ready condition set to True via server-side apply.
    reason: ManuallySet
    status: "True"
    type: Ready
```

### Cleanup

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Delete | HelloWorld/my-hello-world | ✅ |
| 2 | Delete namespace | kest-1j79x | ✅ |
| 3 | Delete | CustomResourceDefinition/helloworlds.example.com | ✅ |

```shellsession
$ kubectl delete HelloWorld/my-hello-world -n kest-1j79x
helloworld.example.com "my-hello-world" deleted from kest-1j79x namespace

$ kubectl delete Namespace/kest-1j79x
namespace "kest-1j79x" deleted

$ kubectl delete CustomResourceDefinition/helloworlds.example.com
customresourcedefinition.apiextensions.k8s.io "helloworlds.example.com" deleted
```

