export const SIGNER_PAGE_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>LPAgent - Confirm</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b1220;
        --panel: #111a2e;
        --muted: #6b7894;
        --text: #e6ecf5;
        --accent: #38bdf8;
        --accent-hover: #0ea5e9;
        --danger: #f87171;
        --warn: #f59e0b;
        --ok: #34d399;
        --border: #1f2a44;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      }
      .wrap { max-width: 640px; margin: 32px auto; padding: 0 16px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .sub { color: var(--muted); margin: 0 0 24px; }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 16px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0;
        border-bottom: 1px dashed var(--border);
      }
      .row:last-child { border-bottom: none; }
      .row .k { color: var(--muted); }
      .row .v { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; text-align: right; }
      .step-title { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      button {
        background: var(--accent);
        color: #0b1220;
        font-weight: 600;
        border: none;
        border-radius: 8px;
        padding: 10px 16px;
        cursor: pointer;
      }
      button.secondary {
        background: transparent;
        color: var(--accent);
        border: 1px solid var(--accent);
      }
      button:hover:not(:disabled) { background: var(--accent-hover); }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
      input, select {
        width: 100%;
        background: #0b1424;
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text);
        padding: 8px 10px;
        font: inherit;
      }
      .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      .grid.two { grid-template-columns: 1fr 1fr; }
      @media (max-width: 480px) { .grid, .grid.two { grid-template-columns: 1fr; } }
      .status { padding: 12px; border-radius: 8px; margin-top: 12px; }
      .status.info { background: #0f1d33; border: 1px solid var(--border); }
      .status.warn { background: #2c2110; border: 1px solid var(--warn); color: var(--warn); }
      .status.error { background: #2c1818; border: 1px solid var(--danger); color: var(--danger); }
      .status.ok { background: #102b22; border: 1px solid var(--ok); color: var(--ok); }
      .muted { color: var(--muted); font-size: 12px; }
      pre { background: #0b1424; padding: 12px; border-radius: 8px; overflow: auto; max-height: 240px; white-space: pre-wrap; word-break: break-all; }
      .hidden { display: none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1 id="title">Confirm</h1>
      <p class="sub" id="subtitle">Connect your wallet and submit.</p>

      <div class="panel" id="header">
        <div class="row"><span class="k">Loading session...</span><span class="v" id="session-id">-</span></div>
      </div>

      <div class="panel">
        <p class="step-title">Step 1 &middot; Connect wallet</p>
        <div class="actions">
          <button id="connect-phantom">Connect Phantom</button>
          <button id="connect-solflare" class="secondary">Connect Solflare</button>
        </div>
        <div class="status info" id="wallet-status">No wallet connected.</div>
      </div>

      <div class="panel hidden" id="form-panel">
        <p class="step-title">Step 2 &middot; Set parameters and submit</p>
        <div id="form-fields"></div>
        <div class="actions">
          <button id="submit-all">Generate &amp; Sign</button>
          <span class="muted" id="generation-count"></span>
        </div>
      </div>

      <div id="result"></div>
      <p class="muted" style="margin-top:24px">
        This page only signs the transactions LPAgent generated. It never sees your seed phrase or private key.
        Always verify the parameters before signing.
      </p>
    </div>

    <script
      src="https://unpkg.com/@solana/web3.js@1.95.0/lib/index.iife.min.js"
      onerror="document.getElementById('header').innerHTML='<div class=\'status error\'>Failed to load Solana web3.js from unpkg. Check your network or ad-blocker, then refresh.</div>'"
    ></script>
    <script>
      window.addEventListener("error", (e) => {
        const header = document.getElementById("header");
        if (header && header.innerHTML.indexOf("Loading session") !== -1) {
          header.innerHTML =
            '<div class="status error">Page error: ' +
            String(e.message ?? e).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) +
            "</div>";
        }
      });
    </script>
    <script>
      const web3 = window.solanaWeb3;

      const sessionId = location.pathname.split("/").pop();
      const $ = (id) => document.getElementById(id);
      const setStatus = (el, kind, html) => {
        el.className = "status " + kind;
        el.innerHTML = html;
      };

      let session = null;
      let wallet = null;

      async function loadSession() {
        try {
          const res = await fetch("/signer/api/tx/" + encodeURIComponent(sessionId));
          if (!res.ok) throw new Error("Session not found or expired (" + res.status + ")");
          session = await res.json();
          applyKind();
          renderHeader();
          renderFormFields();
          updateGenerationCount();
          if (session.status === "submitted") {
            setStatus($("result"), "ok", "Already submitted. You can close this tab.");
            $("submit-all").disabled = true;
          }
        } catch (err) {
          $("header").innerHTML = '<div class="status error">' + escapeHtml(err.message) + "</div>";
        }
      }

      function applyKind() {
        if (session.kind === "zap-out") {
          $("title").textContent = "Confirm Zap-Out";
          $("subtitle").textContent =
            "Withdraw liquidity from your position. Output is hardcoded to SOL (allBaseToken).";
          document.title = "LPAgent - Confirm Zap-Out";
        } else {
          $("title").textContent = "Confirm Zap-In";
          $("subtitle").textContent = "Add liquidity to this pool. Connect wallet, set params, submit.";
          document.title = "LPAgent - Confirm Zap-In";
        }
      }

      function renderHeader() {
        const rows = [
          row("Pair", session.pairLabel ?? "-"),
          row("Owner", session.owner),
          row("Status", session.status),
        ];
        if (session.kind === "zap-in") {
          rows.unshift(row("Pool", session.poolAddress));
          if (session.stratergy) rows.push(row("Strategy", session.stratergy));
          if (session.inputSOL) rows.push(row("Input SOL", session.inputSOL));
          if (session.fromBinId !== null && session.toBinId !== null) {
            rows.push(row("Range", session.fromBinId + " -> " + session.toBinId));
          }
        } else {
          rows.unshift(row("Position", session.positionId));
        }
        $("header").innerHTML = rows.join("");
      }

      function renderFormFields() {
        if (session.kind === "zap-in") {
          const inputSOL = session.inputSOL ?? 0.1;
          const stratergy = session.stratergy ?? "Spot";
          const slippage = session.slippage_bps ?? 500;
          $("form-fields").innerHTML = [
            '<div class="grid">',
            '<div><label for="inputSOL">Input (SOL)</label><input id="inputSOL" type="number" min="0" step="0.001" value="' + escapeHtml(String(inputSOL)) + '" /></div>',
            '<div><label for="stratergy">Strategy</label><select id="stratergy"><option value="Spot"' + selected(stratergy, "Spot") + '>Spot</option><option value="Curve"' + selected(stratergy, "Curve") + '>Curve</option><option value="BidAsk"' + selected(stratergy, "BidAsk") + '>BidAsk</option></select></div>',
            '<div><label for="slippage_bps">Slippage (bps)</label><input id="slippage_bps" type="number" min="0" max="10000" step="1" value="' + escapeHtml(String(slippage)) + '" /></div>',
            "</div>",
          ].join("");
        } else {
          $("form-fields").innerHTML = [
            '<div class="grid two">',
            '<div><label for="bps">Withdraw (bps, 10000 = 100%)</label><input id="bps" type="number" min="1" max="10000" step="1" value="10000" /></div>',
            '<div><label for="slippage_bps">Slippage (bps)</label><input id="slippage_bps" type="number" min="0" max="10000" step="1" value="500" /></div>',
            "</div>",
          ].join("");
        }
      }

      function updateGenerationCount() {
        const el = $("generation-count");
        if (!el || !session) return;
        const max = session.maxGenerations ?? 5;
        const used = session.generationCount ?? 0;
        el.textContent = used === 0 ? "" : "Used " + used + "/" + max + " generations";
      }

      function row(k, v) {
        return '<div class="row"><span class="k">' + escapeHtml(k) + '</span><span class="v">' + escapeHtml(String(v)) + "</span></div>";
      }

      function selected(current, value) {
        return current === value ? " selected" : "";
      }

      function escapeHtml(s) {
        return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      }

      async function connect(provider, name) {
        if (!provider) {
          setStatus($("wallet-status"), "warn", name + " not detected. Install the extension and reload.");
          return;
        }
        try {
          const resp = await provider.connect();
          const pk = resp.publicKey?.toString() ?? provider.publicKey?.toString();
          if (!pk) throw new Error("Wallet returned no public key");
          if (session && pk !== session.owner) {
            setStatus(
              $("wallet-status"),
              "error",
              "Connected wallet <code>" + escapeHtml(pk) + "</code> does not match the linked Discord wallet <code>" + escapeHtml(session.owner) + "</code>. Switch wallets and try again.",
            );
            return;
          }
          wallet = provider;
          setStatus($("wallet-status"), "ok", name + " connected as <code>" + escapeHtml(pk) + "</code>.");
          $("form-panel").classList.remove("hidden");
        } catch (err) {
          setStatus($("wallet-status"), "error", "Connect failed: " + escapeHtml(err.message ?? String(err)));
        }
      }

      function decodeTx(b64) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        try {
          return web3.Transaction.from(bytes);
        } catch {
          return web3.VersionedTransaction.deserialize(bytes);
        }
      }

      function encodeTx(tx) {
        const bytes =
          tx instanceof web3.VersionedTransaction
            ? tx.serialize()
            : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        let binary = "";
        const u8 = new Uint8Array(bytes);
        for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
        return btoa(binary);
      }

      function buildGenerateBody() {
        if (session.kind === "zap-in") {
          return {
            inputSOL: Number($("inputSOL").value),
            stratergy: $("stratergy").value,
            slippage_bps: Number($("slippage_bps").value),
            percentX: session.percentX ?? 0.5,
          };
        }
        return {
          bps: Number($("bps").value),
          slippage_bps: Number($("slippage_bps").value),
        };
      }

      function buildSubmitBody(signedTxs) {
        if (session.kind === "zap-in") {
          const addLen = session.addLiquidityTxsWithJito.length;
          const swapLen = session.swapTxsWithJito.length;
          const addLiquiditySigned = signedTxs.slice(0, addLen).map(encodeTx);
          const swapSigned = signedTxs.slice(addLen, addLen + swapLen).map(encodeTx);
          return {
            addLiquidityTxsWithJito: addLiquiditySigned,
            swapTxsWithJito: swapSigned,
          };
        }
        const closeLen = session.closeTxsWithJito.length;
        const swapLen = session.swapTxsWithJito.length;
        const closeSigned = signedTxs.slice(0, closeLen).map(encodeTx);
        const swapSigned = signedTxs.slice(closeLen, closeLen + swapLen).map(encodeTx);
        return {
          closeTxsWithJito: closeSigned,
          swapTxsWithJito: swapSigned,
        };
      }

      function unsignedTxList() {
        if (session.kind === "zap-in") {
          return [
            ...(session.addLiquidityTxsWithJito ?? []),
            ...(session.swapTxsWithJito ?? []),
          ];
        }
        return [
          ...(session.closeTxsWithJito ?? []),
          ...(session.swapTxsWithJito ?? []),
        ];
      }

      async function submitAll() {
        if (!wallet) {
          setStatus($("result"), "warn", "Connect a wallet first.");
          return;
        }
        const button = $("submit-all");
        const result = $("result");
        button.disabled = true;
        try {
          setStatus(result, "info", "Generating transactions via LPAgent...");
          const genRes = await fetch("/signer/api/generate/" + encodeURIComponent(sessionId), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildGenerateBody()),
          });
          const genData = await genRes.json().catch(() => ({}));
          if (!genRes.ok) {
            const detail = genData && genData.body ? "\n\n" + JSON.stringify(genData.body, null, 2) : "";
            throw new Error((genData.error ?? "Generate failed (" + genRes.status + ")") + detail);
          }
          session = genData;
          console.log("[signer] generate response:", session);
          renderHeader();
          updateGenerationCount();

          const allTxs = unsignedTxList();
          console.log("[signer] allTxs to sign:", allTxs.length, {
            closeLen: session.closeTxsWithJito?.length,
            swapLen: session.swapTxsWithJito?.length,
            addLen: session.addLiquidityTxsWithJito?.length,
          });
          if (allTxs.length === 0) throw new Error("LPAgent returned no transactions to sign");

          setStatus(result, "info", "Requesting wallet signature for " + allTxs.length + " transaction(s)...");
          const signedTxs = await wallet.signAllTransactions(allTxs.map((tx) => decodeTx(tx)));

          const submitBody = buildSubmitBody(signedTxs);
          console.log("[signer] submit body keys:", Object.keys(submitBody), submitBody);

          setStatus(result, "info", "Submitting signed transactions to LPAgent...");
          const submitRes = await fetch("/signer/api/submit/" + encodeURIComponent(sessionId), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(submitBody),
          });
          const submitData = await submitRes.json().catch(() => ({}));
          if (!submitRes.ok) {
            const detail = submitData && submitData.body ? "\n\n" + JSON.stringify(submitData.body, null, 2) : "";
            throw new Error((submitData.error ?? "Submit failed (" + submitRes.status + ")") + detail);
          }

          renderHeader();
          setStatus(
            result,
            "ok",
            "Submitted. You can close this tab and check Discord.<pre>" + escapeHtml(JSON.stringify(submitData, null, 2)) + "</pre>",
          );
        } catch (err) {
          setStatus(result, "error", "Failed: <pre>" + escapeHtml(err.message ?? String(err)) + "</pre>");
          button.disabled = false;
        }
      }

      $("connect-phantom").addEventListener("click", () => connect(window.phantom?.solana, "Phantom"));
      $("connect-solflare").addEventListener("click", () => connect(window.solflare, "Solflare"));
      $("submit-all").addEventListener("click", submitAll);

      if (!web3) {
        $("header").innerHTML =
          '<div class="status error">Solana web3.js was not loaded. Check your network or ad-blocker, then refresh.</div>';
      } else {
        loadSession();
      }
    </script>
  </body>
</html>
`;
