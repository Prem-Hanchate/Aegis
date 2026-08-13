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

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => healthResponse,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the dashboard and loads backend health", async () => {
    render(<App />);

    expect(screen.getByText(/Decentralized Identity/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Service: aegis-backend/i)).toBeInTheDocument());
  });
});
