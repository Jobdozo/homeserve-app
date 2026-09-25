const fs = require("fs");
function load(f) { const raw = fs.readFileSync(f, "utf8"); return { crlf: raw.indexOf("\r\n") !== -1, s: raw.split("\r\n").join("\n") }; }
function save(f, o) { fs.writeFileSync(f, o.crlf ? o.s.split("\n").join("\r\n") : o.s); }
function rep(o, a, b) { if (!o.s.includes(a)) throw new Error("missing " + a.slice(0, 60)); o.s = o.s.replace(a, b); }

const api = load("api.js");
rep(api, "export const api = {", `// CSV goes up as text/csv (not JSON) so a large file isn't subject to the
// JSON body limit; validation errors come back as structured JSON.
async function importCsv(moduleName, csvText, dryRun) {
  const res = await fetch(\`\${API_BASE}/admin/import/\${moduleName}\${dryRun ? "?dryRun=1" : ""}\`, {
    method: "POST",
    headers: { "Content-Type": "text/csv", ...(authToken ? { Authorization: \`Bearer \${authToken}\` } : {}) },
    body: csvText,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || \`Import failed: \${res.status}\`);
  return body;
}

export const api = {
  importCsv,`);
save("api.js", api);

const icons = load("components/icons.jsx");
icons.s += `
export const DownloadIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 4v10" />
    <path d="M8 10.5 12 14.5l4-4" />
    <path d="M5 19h14" />
  </svg>
);
`;
save("components/icons.jsx", icons);

const sb = load("components/Sidebar.jsx");
rep(sb, "  SupportIcon,\n} from \"./icons\";", "  SupportIcon,\n  DownloadIcon,\n} from \"./icons\";");
rep(sb, `      { label: "Settings", icon: SettingsIcon, to: "/settings" },`, `      { label: "Import & Export", icon: DownloadIcon, to: "/data" },
      { label: "Settings", icon: SettingsIcon, to: "/settings" },`);
save("components/Sidebar.jsx", sb);

const app = load("App.jsx");
rep(app, `import SettingsPage from "./pages/SettingsPage";`, `import SettingsPage from "./pages/SettingsPage";
import DataManagementPage from "./pages/DataManagementPage";`);
rep(app, `        <Route path="/settings" element={<SettingsPage />} />`, `        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/data" element={<DataManagementPage />} />`);
save("App.jsx", app);

const ctx = load("context/AppContext.jsx");
rep(ctx, "      reviewService,\n      updateService,\n      deleteService,\n    }),", "      reviewService,\n      updateService,\n      deleteService,\n      refreshData: scheduleRefresh,\n    }),");
save("context/AppContext.jsx", ctx);
