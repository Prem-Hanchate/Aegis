import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthState } from "../context/auth";
import { requestLoginChallenge, verifyLoginChallenge } from "../services/auth";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { setState } = useAuthState();
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "signing">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function connectWallet() {
    setErrorMessage(null);
    if (!window.ethereum) {
      setErrorMessage("MetaMask was not detected. Install the extension, then refresh this page.");
      return;
    }

    try {
      setStatus("connecting");
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("No wallet account was selected.");
      setWalletAddress(address);
      setStatus("signing");
      const challengeResponse = await requestLoginChallenge(address);
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [challengeResponse.challenge.message, address],
      })) as string;
      const verification = await verifyLoginChallenge({
        walletAddress: address,
        message: challengeResponse.challenge.message,
        signature,
      });
      const { identity, session } = verification.result;
      setState({
        status: "authenticated",
        identity: {
          identityId: identity.identityId,
          walletAddress: identity.walletAddress,
          displayName: identity.displayName,
        },
        session,
        deviceId: null,
        roles: identity.roles,
        permissions: [],
        errorMessage: null,
      });
      navigate("/", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Wallet authentication failed.");
      setStatus("idle");
    }
  }

  return (
    <main className="login-layout">
      <section className="login-intro">
        <div className="brand-mark" aria-hidden="true">A</div>
        <p className="eyebrow">Aegis identity layer</p>
        <h1>Trust, verified at the edge.</h1>
        <p className="login-lede">
          A wallet-native access controller for identities, devices, policies, and the resources they protect.
        </p>
        <div className="trust-list">
          <span>Single-use challenges</span>
          <span>Zero Trust authorization</span>
          <span>Auditable access decisions</span>
        </div>
      </section>

      <section className="login-card" aria-labelledby="login-title">
        <div className="card-kicker">Secure gateway</div>
        <h2 id="login-title">Sign in to Aegis</h2>
        <p className="muted-text">Connect your registered wallet to request a fresh authentication challenge.</p>
        <div className="wallet-preview">
          <span className="wallet-dot" />
          <div>
            <strong>{walletAddress ? shortenAddress(walletAddress) : "Wallet not connected"}</strong>
            <small>{status === "signing" ? "Awaiting signature in MetaMask" : "Ethereum-compatible wallet"}</small>
          </div>
        </div>
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
        <button className="primary-button" type="button" onClick={() => void connectWallet()} disabled={status !== "idle"}>
          {status === "connecting" ? "Opening wallet..." : status === "signing" ? "Confirm in MetaMask" : "Connect wallet"}
        </button>
        <p className="login-footnote">Your private key never leaves your wallet. Aegis only verifies the signature.</p>
      </section>
    </main>
  );
}