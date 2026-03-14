import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";

interface NetworkState {
  isConnected: boolean;
  connectionType: NetInfoStateType;
}

const NetworkContext = createContext<NetworkState | undefined>(undefined);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [connectionType, setConnectionType] = useState<NetInfoStateType>(
    NetInfoStateType.unknown,
  );

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      setIsConnected(
        Boolean(state.isConnected && state.isInternetReachable !== false),
      );
      setConnectionType(state.type);
    });
    return () => sub();
  }, []);

  const value = useMemo(
    () => ({
      isConnected,
      connectionType,
    }),
    [isConnected, connectionType],
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkState {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
}
