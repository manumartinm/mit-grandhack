import React from "react";
import { AuthProvider } from "./AuthProvider";
import { PatientProvider } from "./PatientProvider";
import { SppProvider } from "./SppProvider";
import { OutbreakProvider } from "./OutbreakProvider";
import { AiProvider } from "./AiProvider";
import { DoctorCommProvider } from "./DoctorCommProvider";
import { NetworkProvider } from "./NetworkProvider";

export default function AppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NetworkProvider>
      <AuthProvider>
        <PatientProvider>
          <SppProvider>
            <OutbreakProvider>
              <DoctorCommProvider>
                <AiProvider>{children}</AiProvider>
              </DoctorCommProvider>
            </OutbreakProvider>
          </SppProvider>
        </PatientProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}
