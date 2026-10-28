import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthState } from "../context/auth";
import { ApiError, requestLoginChallenge, verifyLoginChallenge } from "../services/auth";
import type { AuthChallenge } from "../types/auth";

function shortenAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

type AuthStep = "idle" | "connecting" | "challenging" | "awaiting_signature" | "verifying";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setSession } = useAuthState();

  const [walletAddress, setWalletAddress] = useState<string>("");
  const [step, setStep] = useState<AuthStep>("idle");
  const [activeChallenge, setActiveChallenge] = useState<AuthChallenge | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(state.errorMessage);
  const [providerAvailable, setProviderAvailable] = useState<boolean>(true);

  // Sync with context error message (e.g. from session expiry or account switch)
  useEffect(() => {
    if (state.errorMessage) {
      setErrorMessage(state.errorMessage);
    }
  }, [state.errorMessage]);

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (state.status === "authenticated" && state.session) {
      const destination = (location.state as { from?: string } | undefined)?.from ?? "/";
      navigate(destination, { replace: true });
    }
  }, [state.status, state.session, location.state, navigate]);

  // Check for Ethereum provider availability on mount
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) {
      setProviderAvailable(false);
    } else {
      setProviderAvailable(true);
    }
  }, []);

  async function handleLogin() {
    setErrorMessage(null);

    const ethereum = window.ethereum;
    if (!ethereum) {
      setProviderAvailable(false);
      setErrorMessage("MetaMask was not detected. Please install the MetaMask extension to authenticate.");
      return;
    }

    try {
      // Step 1: Request wallet connection
      setStep("connecting");
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      const address = accounts?.[0];
      if (!address) {
        throw new Error("No wallet account was selected. Please unlock or connect an account.");
      }
      setWalletAddress(address);

      // Step 2: Request domain-bound single-use challenge from backend
      setStep("challenging");
      const challengeResponse = await requestLoginChallenge(address);
      const challenge = challengeResponse.challenge;
      setActiveChallenge(challenge);

      // Step 3: Present message to user & request signature in MetaMask
      setStep("awaiting_signature");
      let signature: string;
      try {
        signature = (await ethereum.request({
          method: "personal_sign",
          params: [challenge.message, address],
        })) as string;
      } catch (signError: unknown) {
        const errorRecord = signError as { code?: number; message?: string };
        if (errorRecord?.code === 4001 || errorRecord?.message?.toLowerCase().includes("rejected")) {
          throw new Error("Signature request was rejected in MetaMask. Authentication was aborted.");
        }
        throw new Error(errorRecord?.message ?? "Failed to sign the authentication challenge.");
      }

      // Step 4: Submit signature and verify on backend
      setStep("verifying");
      const verificationResponse = await verifyLoginChallenge({
        walletAddress: address,
        message: challenge.message,
        signature,
      });

      const { identity, session } = verificationResponse.result;

      // Establish authenticated session in memory
      setSession(identity, session, identity.roles);

      const destination = (location.state as { from?: string } | undefined)?.from ?? "/";
      navigate(destination, { replace: true });
    } catch (error: unknown) {
      let message = "Wallet authentication failed.";
      if (error instanceof ApiError) {
        if (error.code === "AUTH_IDENTITY_NOT_FOUND") {
          message = "No identity is registered for this wallet. An administrator must register your wallet first.";
        } else if (error.code === "AUTH_IDENTITY_REVOKED") {
          message = "This identity has been revoked. Zero Trust access is denied.";
        } else if (error.code === "AUTH_INVALID_SIGNATURE") {
          message = "The signature could not be verified by the backend.";
        } else if (error.code === "AUTH_NONCE_EXPIRED") {
          message = "The authentication challenge expired. Please try signing again.";
        } else {
          message = error.message;
        }
      } else if (error instanceof Error) {
        message = error.message;
      }
      setErrorMessage(message);
      setStep("idle");
    }
  }

  function handleRetry() {
    setErrorMessage(null);
    setStep("idle");
    void handleLogin();
  }

  const isBusy = step !== "idle";

  return (
    <main className="login-layout">
      <section className="login-intro">
        <div className="brand-mark" aria-hidden="true">
          🛡️
        </div>
        <p className="eyebrow">Aegis Zero Trust Identity</p>
        <h1>Verifiable Access. Edge Secured.</h1>
        <p className="login-lede">
          Decentralized challenge-response authentication. Cryptographically verify your Ethereum wallet to establish an identity-bound Zero Trust session.
        </p>
        <div className="trust-list">
          <span>Domain-bound single-use nonces</span>
          <span>Zero Trust dynamic authorization</span>
          <span>Strict in-memory session security</span>
        </div>
      </section>

      <section className="login-card" aria-labelledby="login-title">
        <div className="card-kicker">Security Gateway</div>
        <h2 id="login-title">Wallet Authentication</h2>
        <p className="muted-text">
          Authenticate using your registered Ethereum wallet. Your private key never leaves your device.
        </p>

        {!providerAvailable ? (
          <div className="provider-warning" role="alert">
            <strong>MetaMask Not Detected</strong>
            <p>A Web3 Ethereum provider is required to authenticate with Aegis.</p>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="button-link"
            >
              Install MetaMask ↗
            </a>
          </div>
        ) : (
          <>
            <div className="wallet-preview">
              <span className={`wallet-dot ${walletAddress ? "wallet-dot-active" : ""}`} />
              <div>
                <strong>
                  {walletAddress ? shortenAddress(walletAddress) : "Wallet Not Connected"}
                </strong>
                <small>
                  {step === "connecting" && "Requesting wallet connection..."}
                  {step === "challenging" && "Requesting server challenge..."}
                  {step === "awaiting_signature" && "Confirm signature prompt in MetaMask..."}
                  {step === "verifying" && "Verifying challenge on backend..."}
                  {step === "idle" && (walletAddress ? "Ready to authenticate" : "Ethereum Web3 Provider")}
                </small>
              </div>
            </div>

            {activeChallenge && isBusy && (
              <div className="challenge-preview">
                <span className="challenge-tag">Challenge Context</span>
                <p>
                  <strong>Domain:</strong> {activeChallenge.domain}
                </p>
                <p>
                  <strong>Purpose:</strong> {activeChallenge.purpose}
                </p>
                <p>
                  <strong>Expires:</strong>{" "}
                  {new Date(activeChallenge.expiresAt).toLocaleTimeString()}
                </p>
              </div>
            )}

            {errorMessage ? (
              <div className="form-error" role="alert">
                <p>{errorMessage}</p>
                <button
                  type="button"
                  className="retry-button"
                  onClick={handleRetry}
                >
                  Retry Authentication
                </button>
              </div>
            ) : null}

            <button
              className="primary-button"
              type="button"
              onClick={() => void handleLogin()}
              disabled={isBusy}
            >
              {step === "connecting" && "Connecting Wallet..."}
              {step === "challenging" && "Retrieving Challenge..."}
              {step === "awaiting_signature" && "Awaiting Signature in MetaMask..."}
              {step === "verifying" && "Verifying Signature..."}
              {step === "idle" && "Connect Wallet & Sign In"}
            </button>

            <p className="login-footnote">
              🔒 Challenge signatures are cryptographic proofs of wallet ownership verified against the Aegis Identity Registry.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
