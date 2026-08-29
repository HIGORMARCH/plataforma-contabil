/**
 * Runtime helper — descifra o .pfx cifrado do banco quando precisar usar.
 *
 * O SERPRO client (mTLS) e algumas libs precisam de um ARQUIVO no filesystem
 * (não aceitam Buffer). Este helper escreve em arquivo temporário, chama seu
 * callback, e apaga o arquivo depois — mesmo se der erro.
 */

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { decifrar, decifrarBytes } from "@/lib/crypto";
import {
  carregarPfx,
  carregarPfxDeBuffer,
  type CertificadoCarregado,
} from "@/lib/serpro/pkcs12";

export interface CertificadoUso {
  caminhoTemp: string; // path do .pfx temporário — some após o callback
  senha: string; // senha em plaintext (só durante a chamada)
}

/**
 * Materializa o certificado do cliente em arquivo temp e executa o callback.
 * Depois apaga o arquivo. Usa try/finally pra garantir limpeza.
 *
 * @throws se o cliente não tem CERTIFICADO_PROPRIO instalado.
 */
export async function comCertificadoDoCliente<T>(
  clienteId: string,
  callback: (cert: CertificadoUso) => Promise<T>,
): Promise<T> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      metodoAcessoEcac: true,
      certificadoArquivo: true,
      certificadoSenha: true,
      certificadoNomeArquivo: true,
    },
  });
  if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado.`);
  if (cliente.metodoAcessoEcac !== "CERTIFICADO_PROPRIO") {
    throw new Error(
      `Cliente ${clienteId} está com método PROCURACAO_MARCH — usa o cert do escritório.`,
    );
  }
  if (!cliente.certificadoArquivo || !cliente.certificadoSenha) {
    throw new Error(
      `Cliente ${clienteId} não tem certificado instalado. Suba o .pfx na tela de edição.`,
    );
  }

  const bytes = decifrarBytes(Buffer.from(cliente.certificadoArquivo));
  const senha = decifrar(cliente.certificadoSenha);

  const dir = await mkdtemp(path.join(tmpdir(), "plataforma-cert-"));
  const nomeArq = cliente.certificadoNomeArquivo?.replace(/[^\w.-]/g, "_") ?? "cert.pfx";
  const arquivoTemp = path.join(dir, nomeArq);
  try {
    await writeFile(arquivoTemp, bytes, { mode: 0o600 });
    return await callback({ caminhoTemp: arquivoTemp, senha });
  } finally {
    // Best-effort cleanup — mesmo se callback falhar
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
}

/**
 * Carrega o certificado do cliente EM MEMÓRIA, sem passar por arquivo temporário.
 *
 * Preferência pelo .pfx cifrado no banco (`certificadoArquivo`); o caminho em
 * disco (`certificadoCaminho`) é o modo antigo e fica como fallback. Devolve
 * `null` quando o cliente não usa certificado próprio ou não tem certificado
 * cadastrado — quem chama decide se isso é erro.
 *
 * Use esta função quando o certificado só precisa assinar um termo (SERPRO).
 * `comCertificadoDoCliente` continua sendo o caminho pra libs que exigem um
 * arquivo de verdade no disco.
 */
export async function carregarCertificadoDoCliente(
  clienteId: string,
): Promise<CertificadoCarregado | null> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      metodoAcessoEcac: true,
      certificadoArquivo: true,
      certificadoCaminho: true,
      certificadoNomeArquivo: true,
      certificadoSenha: true,
    },
  });
  if (!cliente || cliente.metodoAcessoEcac !== "CERTIFICADO_PROPRIO") return null;
  if (!cliente.certificadoSenha) return null;
  const senha = decifrar(cliente.certificadoSenha);

  if (cliente.certificadoArquivo) {
    return carregarPfxDeBuffer(
      decifrarBytes(Buffer.from(cliente.certificadoArquivo)),
      senha,
      cliente.certificadoNomeArquivo ?? "certificado armazenado no banco",
    );
  }
  if (cliente.certificadoCaminho) {
    return carregarPfx(cliente.certificadoCaminho, senha);
  }
  return null;
}
