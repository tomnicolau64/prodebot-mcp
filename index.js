import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import express from "express";

const app = express();
app.use(express.json());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const sheets = google.sheets({ version: "v4", auth: oauth2Client });

const server = new Server(
  { name: "prodebot-sheets", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const row = args.id_partido + 2;

  try {
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
      return { content: [{ type: "text", text: `✅ Partido ${args.id_partido} actualizado en fila ${row}.` }] };
    }

    if (name === "actualizar_resultado_real") {
      await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: `datos!AA${row}:AB${row}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[args.real_goles_e1, args.real_goles_e2]] }
      });
      return { content: [{ type: "text", text: `✅ Resultado real del partido ${args.id_partido} actualizado.` }] };
    }

    if (name === "leer_partido") {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: args.spreadsheetId,
        range: `datos!A${row}:AK${row}`
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data.values?.[0] ?? []) }] };
    }

  } catch (error) {
    return { content: [{ type: "text", text: `❌ Error: ${error.message}` }] };
  }
});

// HTTP + SSE transport
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/", (req, res) => res.send("ProdeBot MCP Server running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));