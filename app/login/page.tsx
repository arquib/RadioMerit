import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="login">
      <h1>RadioMerit</h1>
      <p className="muted">MD Radiology hospital allocation: unofficial, for the batch to coordinate. Enter the password you were given.</p>
      <LoginForm />
    </div>
  );
}
