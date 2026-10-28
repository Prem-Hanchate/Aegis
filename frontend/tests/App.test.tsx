import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";

const healthResponse = {
  status: "ok",
  service: "aegis-backend",
  environment: "test",
  timestamp: new Date().toISOString(),
  database: {
    connected: false,
    readyState: 0,
    name: null,
  },
};

describe("App Route & Gateway Protection", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => healthResponse,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the wallet authentication gateway for unauthenticated visitors", () => {
    render(<App />);

    expect(screen.getByText(/Wallet Authentication/i)).toBeInTheDocument();
    expect(screen.getByText(/Verifiable Access. Edge Secured./i)).toBeInTheDocument();
  });

  it("detects when MetaMask is not installed and shows provider warning", () => {
    // window.ethereum is undefined
    render(<App />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/MetaMask Not Detected/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Install MetaMask/i })).toBeInTheDocument();
  });
});
