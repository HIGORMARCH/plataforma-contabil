-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "certificadoArquivo" BYTEA,
ADD COLUMN     "certificadoNomeArquivo" TEXT,
ADD COLUMN     "certificadoValidade" TIMESTAMP(3);
