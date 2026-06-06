import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { EXERCICIOS_EXEMPLO } from "../src/lib/accounting/sample";

const prisma = new PrismaClient();

async function main() {
  // Idempotente: limpa e recria o ambiente de demonstração.
  await prisma.relatorio.deleteMany();
  await prisma.exercicio.deleteMany();
  await prisma.logAcesso.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.escritorio.deleteMany();

  const escritorio = await prisma.escritorio.create({
    data: {
      razaoSocial: "MARCH CONTABILIDADE E ASSESSORIA TRIBUTARIA EIRELI - ME",
      nomeFantasia: "March Contabilidade",
      cnpj: "22.397.212/0001-97",
      crc: "CRC/TO 000318/O",
      endereco: "Palmas — TO",
      telefone: null,
      email: "contato@marchcontabilidade.com.br",
      site: "www.marchcontabilidade.com.br",
      corPrimaria: "#4d4b40",
      corSecundaria: "#d2bd97",
      rodapePadrao:
        "March Contabilidade — Documento gerado eletronicamente. Sujeito a revisão técnica do contador responsável.",
    },
  });

  const senha = (s: string) => bcrypt.hashSync(s, 10);

  const cliente = await prisma.cliente.create({
    data: {
      razaoSocial: "Comercial Modelo Ltda.",
      nomeFantasia: "Loja Modelo",
      cnpj: "98.765.432/0001-10",
      inscricaoEstadual: "111.222.333.444",
      inscricaoMunicipal: "9.876.543-2",
      cnaePrincipal: "47.81-4-00 — Comércio varejista de artigos do vestuário",
      regimeTributario: "Lucro Presumido",
      porte: "EPP",
      naturezaJuridica: "Sociedade Empresária Limitada",
      municipio: "São Paulo",
      uf: "SP",
      setorAtividade: "comercio",
      responsavelLegal: "João da Silva",
      contadorResponsavel: "Maria Souza",
      crcContador: "CRC/SP 1SP234567/O-1",
      email: "financeiro@lojamodelo.com.br",
      telefone: "(11) 3000-0000",
      escritorioId: escritorio.id,
    },
  });

  for (const ex of EXERCICIOS_EXEMPLO) {
    await prisma.exercicio.create({
      data: {
        ano: ex.ano,
        dadosJson: JSON.stringify(ex),
        documentos: JSON.stringify(ex.documentosFornecidos ?? []),
        clienteId: cliente.id,
      },
    });
  }

  await prisma.usuario.createMany({
    data: [
      {
        nome: "Administrador",
        email: "admin@marchcontabilidade.com.br",
        senhaHash: senha("admin123"),
        papel: "ADMIN",
        escritorioId: escritorio.id,
        aceiteTermos: true,
      },
      {
        nome: "Maria Souza",
        email: "contador@marchcontabilidade.com.br",
        senhaHash: senha("contador123"),
        papel: "CONTADOR",
        crc: "CRC/SP 1SP234567/O-1",
        escritorioId: escritorio.id,
        aceiteTermos: true,
      },
      {
        nome: "Carlos Analista",
        email: "analista@marchcontabilidade.com.br",
        senhaHash: senha("analista123"),
        papel: "ANALISTA",
        escritorioId: escritorio.id,
        aceiteTermos: true,
      },
    ],
  });

  await prisma.usuario.create({
    data: {
      nome: "João da Silva (Loja Modelo)",
      email: "cliente@lojamodelo.com.br",
      senhaHash: senha("cliente123"),
      papel: "CLIENTE",
      escritorioId: escritorio.id,
      clienteId: cliente.id,
      aceiteTermos: true,
    },
  });

  console.log("Seed concluído.");
  console.log("Usuários de acesso:");
  console.log("  ADMIN     -> admin@marchcontabilidade.com.br / admin123");
  console.log("  CONTADOR  -> contador@marchcontabilidade.com.br / contador123");
  console.log("  ANALISTA  -> analista@marchcontabilidade.com.br / analista123");
  console.log("  CLIENTE   -> cliente@lojamodelo.com.br / cliente123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
