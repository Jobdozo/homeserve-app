// Loads agents/.env for local runs without adding a dependency (Node >= 20.6
// has process.loadEnvFile). In Docker the variables come from compose instead.
const path = require("path");
const fs = require("fs");
const file = path.join(__dirname, "..", ".env");
if (fs.existsSync(file) && typeof process.loadEnvFile === "function") process.loadEnvFile(file);
