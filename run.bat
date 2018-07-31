@echo off
set cnt=0
echo "start trading"
:loop
@npm run client -- --address http://hola.darksi.de/v1/standard  --name your@email.com:random_string#public-tag  --script /path/to/script
set /a cnt+=1
set /a cntb = cnt%%1000
if %cntb% equ 0 echo "trades count %cnt%"
goto loop
