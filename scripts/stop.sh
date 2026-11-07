#!/bin/bash
# Stop backend (4000) and frontend (5173)
# Usage: ./scripts/stop.sh [port]

stop_port() {
  local PORT=$1
  local PID=$(lsof -ti:$PORT 2>/dev/null)
  
  if [ -z "$PID" ]; then
    echo "Port $PORT üzerinde çalışan bir işlem yok."
  else
    # kill -9 ile işlemi kesin olarak (force) sonlandırıyoruz
    kill -9 $PID
    echo "Port $PORT üzerindeki PID $PID zorla durduruldu."
  fi
}

# Eğer komutu çalıştırırken port verirseniz (örn: ./scripts/stop.sh 4000) sadece onu durdurur.
# Port vermezseniz hem 4000 hem 5173'ü durdurur.
if [ -n "$1" ]; then
  stop_port $1
else
  stop_port 4000
  stop_port 5173
fi