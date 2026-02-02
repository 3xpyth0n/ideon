"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface AppConfig {
  isSetupComplete: boolean;
}

interface ConfigContextType {
  config: AppConfig | null;
  loading: boolean;
}

const ConfigContext = createContext<ConfigContextType>({
  config: null,
  loading: true,
});

export function ConfigProvider({
  children,
  isSetupComplete,
}: {
  children: React.ReactNode;
  isSetupComplete: boolean;
}) {
  const [config, setConfig] = useState<AppConfig | null>({ isSetupComplete });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setConfig({ isSetupComplete });
    setLoading(false);
  }, [isSetupComplete]);

  return (
    <ConfigContext.Provider value={{ config, loading }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}
