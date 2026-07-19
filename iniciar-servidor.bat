@echo off
REM Sobe a Plataforma Contabil (Next.js) na porta 3000.
REM Modo dev: NAO exige build de producao (o "npm run start" exige e quebrava).
REM Sem abrir navegador e sem pause - proprio para o supervisor do MarchPortal.
cd /d C:\Dev\plataforma-contabil
start "Plataforma :3000" /min cmd /c "npm run dev"
