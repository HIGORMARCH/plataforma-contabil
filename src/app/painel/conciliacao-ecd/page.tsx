import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

export default function Page() {
  return (
    <ModuloClienteIndex
      titulo="Conciliação ECD"
      descricao="Cruza o balanço importado do Domínio com o SPED-ECD oficial no nível 3 do balanço patrimonial. Sinaliza divergências de totais e reclassificações internas."
      categoria="Contábil"
      caminhoModulo="conciliacao-ecd"
      icone="🔍"
    />
  );
}
