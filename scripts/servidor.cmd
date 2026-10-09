@echo off
rem Inicia o servidor do Cofre com tunnel. Deixe esta janela aberta.
cd /d "%~dp0.."
:loop
npx expo start --tunnel --port 8081
echo Servidor parou. Reiniciando em 10 segundos...
timeout /t 10 >nul
goto loop
