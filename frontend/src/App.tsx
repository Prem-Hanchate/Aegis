import { AuthStateProvider } from "./context/auth";
import { AppRouter } from "./routes/AppRouter";
import { AuthStateProvider } from "./context/auth";

export function App() {
  return (
    <AuthStateProvider>
      <AppRouter />
    </AuthStateProvider>
  );
}
