import { modeloCSV } from "@/lib/import";

export async function GET() {
  return new Response("﻿" + modeloCSV(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="modelo-importacao.csv"',
    },
  });
}
