@echo off
echo Starting Prometheus...
start "Prometheus" prometheus --config.file=prometheus.yml

echo Starting Grafana...
start "Grafana" grafana-server

echo Monitoring tools started in background windows.
pause
