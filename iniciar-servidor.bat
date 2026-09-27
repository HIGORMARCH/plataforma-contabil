@echo off
REM Sobe a Plataforma Contabil (Next.js) na porta 3000.
REM Modo dev: NAO exige build de producao (o "npm run start" exige e quebrava).
REM Sem abrir navegador e sem pause - proprio para o supervisor do MarchPortal.
cd /d C:\Dev\plataforma-contabil

REM 27/09/2026: saiu o "start /min". O comando start CRIA uma janela nova
REM por definicao - o /min so a deixava minimizada, e o next-server renomeava
REM o titulo. Era isso que enchia a tela do Higor de janelas pretas a cada
REM reinicio. Chamando direto, o processo herda o console de quem o subiu:
REM oculto quando vem do portal, visivel quando voce da dois cliques aqui.
call npm run dev
