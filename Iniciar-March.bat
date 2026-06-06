@echo off
chcp 65001 >nul
title March Contabilidade - Plataforma
cd /d "%~dp0"

echo ==================================================
echo    MARCH CONTABILIDADE - Plataforma Contabil
echo ==================================================
echo.
echo  Iniciando a plataforma...
echo  - Deixe esta janela ABERTA enquanto estiver usando.
echo  - O navegador abre sozinho em alguns segundos.
echo  - Para encerrar: feche esta janela.
echo.

rem Abre o navegador automaticamente apos o servidor subir (em paralelo)
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"

rem Sobe o servidor (esta janela fica ocupada mantendo a plataforma no ar)
call npm run start

echo.
echo  A plataforma foi encerrada.
pause
