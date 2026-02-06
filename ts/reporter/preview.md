# hello world

## Scenario Overview

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Create namespace | kest-z1cbd | ✅ |
| 2 | Apply | ConfigMap/my-config-1 | ✅ |
| 3 | Apply | ConfigMap/my-config-2 | ✅ |
| 4 | Assert | ConfigMap/my-config-1 | ❌ |

## Scenario Details

### Given: create Namespace

**✅ Create Namespace "kest-z1cbd"**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata: 
  name: kest-z1cbd
EOF
```

```text title="stdout"
namespace/kest-z1cbd created
```

### When: apply ConfigMap

**✅ Apply ConfigMap "my-config-1" in namespace "kest-z1cbd"**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-1
  namespace: kest-z1cbd
data: 
  mode: demo-1
EOF
```

```text title="stdout"
configmap/my-config-1 created
```

**✅ Apply ConfigMap "my-config-2" in namespace "kest-z1cbd"**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata: 
  name: my-config-2
  namespace: kest-z1cbd
data: 
  mode: demo-2
EOF
```

```text title="stdout"
configmap/my-config-2 created
```

### Then: confirm ConfigMap

**❌ Assert ConfigMap "my-config-1" in namespace "kest-z1cbd"** (Failed after 20 attempts)

```shell
kubectl get ConfigMap/my-config-1 -n kest-z1cbd -o yaml
```

```yaml title="stdout"
apiVersion: v1
data:
  mode: demo-1
kind: ConfigMap
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"v1","data":{"mode":"demo-1"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-1","namespace":"kest-z1cbd"}}
  creationTimestamp: "2026-02-02T20:36:19Z"
  name: my-config-1
  namespace: kest-z1cbd
  resourceVersion: "233137"
  uid: 728724f6-3e7f-4db0-9d7f-f91c50a30b18
```

Error:

```diff
expect(received).toMatchObject(expected)

  {
+   "apiVersion": "v1",
    "data": {
-     "mode": "demo",
+     "mode": "demo-1",
+   },
+   "kind": "ConfigMap",
+   "metadata": {
+     "annotations": {
+       "kubectl.kubernetes.io/last-applied-configuration": 
+ "{"apiVersion":"v1","data":{"mode":"demo-1"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-1","namespace":"kest-7d4vc"}}
+ "
+ ,
+     },
+     "creationTimestamp": "2026-02-02T21:25:43Z",
+     "name": "my-config-1",
+     "namespace": "kest-7d4vc",
+     "resourceVersion": "237000",
+     "uid": "88f0f9c7-3402-496c-a06e-585a2572c862",
    },
  }

- Expected  - 1
+ Received  + 16
```

### Cleanup

| # | Action | Resource | Status |
|---|--------|----------|--------|
| 1 | Delete | ConfigMap/my-config-2 | ✅ |
| 2 | Delete | ConfigMap/my-config-1 | ✅ |
| 3 | Delete namespace | kest-z1cbd | ✅ |

```shellsession
$ kubectl delete ConfigMap/my-config-2 -n kest-z1cbd
configmap "my-config-2" deleted from kest-z1cbd namespace

$ kubectl delete ConfigMap/my-config-1 -n kest-z1cbd
configmap "my-config-1" deleted from kest-z1cbd namespace

$ kubectl delete namespace/kest-z1cbd
namespace "kest-z1cbd" deleted
```

