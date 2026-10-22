@echo off
rem Liga o servidor do Cofre (tunnel) para abrir o app no Expo Go, sempre no mesmo endereco.
rem Dois cliques neste arquivo. Deixe a janela aberta; fechar a janela desliga o servidor.
chcp 65001 >nul
title Cofre - servidor
cd /d "%~dp0"
set "ESPERAR=%SystemRoot%\System32\timeout.exe"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js LTS em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando as dependencias do projeto. Na primeira vez demora alguns minutos...
  call npm install
  if errorlevel 1 (
    echo Falhou o npm install. Confira a internet e abra este arquivo de novo.
    pause
    exit /b 1
  )
)

rem O endereco do tunnel leva o usuario do Expo: precisa ser a conta gregory.ks
call npx expo whoami >nul 2>nul
if errorlevel 1 (
  echo.
  echo Entre na conta Expo gregory.ks (a mesma senha do site expo.dev^).
  call npx expo login
)

:ligar
node scripts\prepararServidor.js
if errorlevel 2 (
  "%ESPERAR%" /t 30 >nul
  goto ligar
)
if errorlevel 1 (
  pause
  exit /b 1
)
call npx expo start --tunnel --port 8081
echo.
echo O servidor parou. Ligando de novo em 10 segundos (feche esta janela para desligar^)...
"%ESPERAR%" /t 10 >nul
goto ligar
