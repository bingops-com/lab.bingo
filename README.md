# lab.bingo

The public service directory at **https://lab.bingo**, maintained by Corentin
Guyon. The site and its Kubernetes runtime belong to this repository. The
[LabOps repository](https://github.com/bingops-com/labops) declares the Argo CD
Application and owns the shared cluster, DNS, TLS issuer and Cloudflare Tunnel.

## Content and development

`web/index.html` is the catalogue of 14 services. Update the URL, description,
`data-access`, `data-category` and searchable `data-keywords` together.
`web/style.css` owns presentation; `web/app.js` adds optional interactions.
Fonts, SVG icons and their OFL licences are served locally.

The four purpose groups are **Notes & code**, **Jeux**, **Infrastructure** and
**À propos**. Coder is paired with its Dev previews; browser games are separate
from RomM and its requests; Status is grouped with infrastructure. Public,
SSO and private access labels describe the linked services, not permissions
granted by this directory. Private services require LAN/Tailscale; public
services may still require their own account.

Search combines with category and access filters. Visitors can pin up to four
shortcuts, initially Notes, Coder and Portal. Theme (`lab-theme`) and shortcuts
(`lab-shortcuts-v1`) are optional, disposable browser-local preferences. They
are not synchronized or backed up. Light is the initial theme; all service
links and category anchors work without JavaScript. Motion respects the
reduced-motion preference. No availability or activity is simulated.

Run with the already-installed Python, Node and kubectl tools; no application
packages or build step are required:

```sh
make dev                    # http://127.0.0.1:4187
make dev PORT=5173
make check                  # JS syntax, offline tests, Kustomize render
```

The Python preview serves static files. Production security headers and
`/healthz` are provided by Caddy. CI checks the real pinned Caddy image with
the same nonroot, read-only, capability-free constraints as Kubernetes and
runs HTTP tests against that disposable localhost server. It never deploys.
For browser review, verify widths 320, 390, 768 and 1440 px, both themes,
combined filters/reset, keyboard `/` and Escape, pin/unpin and reload,
empty shortcuts, blocked/malformed storage and no-JavaScript navigation.

## Runtime and GitOps

`kustomization.yaml` packages `web/`, fonts and `Caddyfile` into hashed
ConfigMaps and renders `deploy/namespace.yaml` and `deploy/server.yaml`.
The only workload environment is `labprod`; the existing resource names are
retained: namespace `hub`, Deployment/Service/Ingress `hub`, TLS Secret
`hub-tls`. The Service listens on port 80 and forwards to Caddy on 8080.

Caddy 2.11.7 is pinned by digest. It runs as UID/GID 1000 with a read-only root,
all capabilities dropped, no ServiceAccount token and bounded temporary
volumes. The upstream binary has a privileged-port file capability; copying
it into `/tmp` before execution omits that xattr without granting privileges.
Caddy's admin API is disabled. The CSP permits local scripts, styles, fonts
and images, blocks browser API calls and prevents framing. There are no CDN,
analytics, external fonts, private APIs or linked-service health probes.

LabOps `apps/gitops/clusters/labprod/hub.yaml` selects this repository's
`master` branch at path `.` for `hub-labprod`. Its AppProject allowlist includes
this repository. After that integration is deployed, merging here triggers
Argo CD's automatic synchronization; hashed ConfigMaps roll the Deployment.
A GitHub push/merge is therefore a production action. Publishing an initial
repository does not migrate the existing LabOps Application by itself.

Public source reads require no Git credential. Writers need repository push
permission. DNS, certificates, tunnel credentials, private portal access and
source migration/rollback are owned by the
[LabOps hub runbook](https://github.com/bingops-com/labops/blob/master/apps/workloads/hub/README.md).
No image build, registry credential or cross-repository dispatch token is
needed. The pinned public Caddy image is the external runtime artifact.

## State, recovery and verification

There is no database, account, administrator UI, PVC or application secret.
SSO and data retention apply to linked services, not this read-only directory.
All application content and font licences are in Git; temporary volumes and
browser preferences are disposable. Rebuild from this repository after LabOps
has restored the shared infrastructure. Recover source from GitHub or the
retained Coder clone using the
[Coder backup runbook](https://github.com/bingops-com/labops/blob/master/apps/workloads/coder/README.md#backup-behavior).
Keep this source repository available when rebuilding; public source and image
availability are prerequisites, not embedded application credentials.

Repeated GitOps reconciliation is idempotent. Roll back a site update by
reverting it here; coordinate with LabOps when rolling back the initial
repository migration. Check without displaying Secrets:

```sh
kubectl kustomize . >/dev/null
kubectl --context labprod -n argocd-system get application hub-labprod
kubectl --context labprod -n hub get deployment,service,ingress,certificate
curl --fail --silent https://lab.bingo/healthz
```

Require Synced/Healthy, a ready Deployment/certificate and HTTP 200. Render and
unit tests alone do not establish deployment or live availability.
