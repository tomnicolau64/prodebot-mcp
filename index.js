import express from "express";
import { google } from "googleapis";

const app = express();
app.use(express.json());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const sheets = google.sheets({ version: "v4", auth: oauth2Client });

const TOOLS = [
  {
    name: "actualizar_partido",
    description: "Actualiza los datos de pronóstico del agente para un partido del Mundial 2026",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        id_partido: { type: "number" },
        ag_analizado: { type: "string" },
        ag_prob_e1: { type: "number" },
        ag_prob_emp: { type: "number" },
        ag_prob_e2: { type: "number" },
        ag_resultado: { type: "string" },
        ag_goles_e1: { type: "number" },
        ag_goles_e2: { type: "number" },
        ag_confianza: { type: "number" },
        ag_valuebet: { type: "string" }
      },
      required: ["spreadsheetId", "id_partido"]
    }
  },
  {
    name: "actualizar_resultado_real",
    description: "Actualiza el resultado real de un partido",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        id_partido: { type: "number" },
        real_goles_e1: { type: "number" },
        real_goles_e2: { type: "number" }
      },
      required: ["spreadsheetId", "id_partido", "real_goles_e1", "real_goles_e2"]
    }
  },
  {
    name: "leer_partido",
    description: "Lee los datos de un partido específico",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        id_partido: { type: "number" }
      },
      required: ["spreadsheetId", "id_partido"]
    }
  }
];

async function handleTool(name, args) {
  const row = args.id_partido + 2;

  if (name === "actualizar_partido") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: args.spreadsheetId,
      range: `datos!O${row}:W${row}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[
        args.ag_analizado ?? "",
        args.ag_prob_e1 ?? "",
        args.ag_prob_emp ?? "",
        args.ag_prob_e2 ?? "",
        args.ag_resultado ?? "",
        args.ag_goles_e1 ?? "",
        args.ag_goles_e2 ?? "",
        args.ag_confianza ?? "",
        args.ag_valuebet ?? ""
      ]]}
    });
    return `✅ Partido ${args.id_partido} actualizado en fila ${row}.`;
  }

  if (name === "actualizar_resultado_real") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: args.spreadsheetId,
      range: `datos!AA${row}:AB${row}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[args.real_goles_e1, args.real_goles_e2]] }
    });
    return `✅ Resultado real del partido ${args.id_partido} actualizado.`;
  }

  if (name === "leer_partido") {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: args.spreadsheetId,
      range: `datos!A${row}:AK${row}`
    });
    return JSON.stringify(res.data.values?.[0] ?? []);
  }

  throw new Error(`Tool ${name} not found`);
}

// MCP over HTTP+SSE
const sessions = new Map();

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const sessionId = Math.random().toString(36).slice(2);
  sessions.set(sessionId, res);

  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  req.on("close", () => sessions.delete(sessionId));
});

app.post("/messages", async (req, res) => {
  const { sessionId } = req.query;
  const sseRes = sessions.get(sessionId);
  const body = req.body;

  let response;

  try {
    if (body.method === "initialize") {
      response = {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "prodebot-sheets", version: "1.0.0" }
        }
      };
    } else if (body.method === "tools/list") {
      response = {
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: TOOLS }
      };
    } else if (body.method === "tools/call") {
      const result = await handleTool(body.params.name, body.params.arguments);
      response = {
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: result }] }
      };
    } else if (body.method === "notifications/initialized") {
      res.status(200).json({});
      return;
    } else {
      response = {
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: "Method not found" }
      };
    }
  } catch (err) {
    response = {
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32000, message: err.message }
    };
  }

  if (sseRes) {
    sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }
  res.status(200).json({});
});

app.get("/", (req, res) => res.send("ProdeBot MCP Server running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));