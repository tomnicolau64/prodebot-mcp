import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

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
          spreadsheetId: { type: "string", description: "ID del Google Sheet" },
          id_partido: { type: "number", description: "ID del partido (1-104)" },
          ag_analizado: { type: "string", description: "Sí o No" },
          ag_prob_e1: { type: "number", description: "Probabilidad victoria Equipo1 (%)" },
          ag_prob_emp: { type: "number", description: "Probabilidad empate (%)" },
          ag_prob_e2: { type: "number", description: "Probabilidad victoria Equipo2 (%)" },
          ag_resultado: { type: "string", description: "E1, Emp o E2" },
          ag_goles_e1: { type: "number", description: "Goles estimados Equipo1" },
          ag_goles_e2: { type: "number", description: "Goles estimados Equipo2" },
          ag_confianza: { type: "number", description: "Confianza 0-100" },
          ag_valuebet: { type: "string", description: "Sí, No o Marginal" }
        },
        required: ["spreadsheetId", "id_partido", "ag_analizado"]
      }
    },
    {
      name: "actualizar_resultado_real",
      description: "Actualiza el resultado real de un partido una vez jugado",
      inputSchema: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string", description: "ID del Google Sheet" },
          id_partido: { type: "number", description: "ID del partido (1-104)" },
          real_goles_e1: { type: "number", description: "Goles reales Equipo1" },
          real_goles_e2: { type: "number", description: "Goles reales Equipo2" }
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
          spreadsheetId: { type: "string", description: "ID del Google Sheet" },
          id_partido: { type: "number", description: "ID del partido (1-104)" }
        },
        required: ["spreadsheetId", "id_partido"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const row = args.id_partido + 2; // fila 1=headers grupo1, fila 2=headers col, fila 3=partido 1

  try {
    if (name === "actualizar_partido") {
      const values = [
        args.ag_analizado ?? "",
        args.ag_prob_e1 ?? "",
        args.ag_prob_emp ?? "",
        args.ag_prob_e2 ?? "",
        args.ag_resultado ?? "",
        args.ag_goles_e1 ?? "",
        args.ag_goles_e2 ?? "",
        args.ag_confianza ?? "",
        args.ag_valuebet ?? ""
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: `datos!O${row}:W${row}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [values] }
      });

      return { content: [{ type: "text", text: `✅ Partido ${args.id_partido} actualizado correctamente en fila ${row}.` }] };
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

      const row_data = res.data.values?.[0] ?? [];
      return { content: [{ type: "text", text: JSON.stringify(row_data) }] };
    }

  } catch (error) {
    return { content: [{ type: "text", text: `❌ Error: ${error.message}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);