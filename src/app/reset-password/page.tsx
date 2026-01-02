import { ResetPasswordClient } from "./ResetPasswordClient";
import { Suspense } from "react";

export const metadata = {
  title: "Reset Password",
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordClient />
    </Suspense>
  );
}
