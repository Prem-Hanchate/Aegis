import { AuthStateProvider } from "./context/auth";
import { AppRouter } from "./routes/AppRouter";

export function App() {
  return (
    <AuthStateProvider>
      <AppRouter />
    </AuthStateProvider>
  );
}
