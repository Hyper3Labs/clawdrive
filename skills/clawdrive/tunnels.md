# Exposing ClawDrive Publicly via Tunnel

ClawDrive serves on `localhost:7432` by default. To share with someone outside your network, create a tunnel. Options ranked by recommendation:

## 1. Tailscale Funnel (best if already on Tailscale)
```bash
brew install --formula tailscale && sudo brew services start tailscale && sudo tailscale up
tailscale funnel --https=443 http://127.0.0.1:7432
```
Gives a stable `*.ts.net` HTTPS URL. Requires a tailnet with Funnel enabled in ACL policy. Ports limited to 443, 8443, 10000.

## 2. Cloudflare Tunnel (best zero-account quick tunnel)
```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:7432
```
Instant random `trycloudflare.com` HTTPS URL. No account needed for quick tunnels.

## 3. ngrok (most mature, requires account)
```bash
brew install ngrok
ngrok config add-authtoken $NGROK_AUTHTOKEN
ngrok http 7432
```

## 4. SSH tunnel via Serveo (zero install)
```bash
ssh -R 80:localhost:7432 serveo.net
```

## 5. bore (open-source, self-hostable)
```bash
brew install bore-cli
bore local 7432 --to bore.pub
```

## 6. localtunnel (npm-based, simple)
```bash
npx localtunnel --port 7432
```
