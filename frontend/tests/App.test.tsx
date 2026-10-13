import { render, screen } from "@testing-library/react";
import { App } from "../src/App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the wallet login gateway", () => {
    render(<App />);

    expect(screen.getByText(/Sign in to Aegis/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument();
  });
});
