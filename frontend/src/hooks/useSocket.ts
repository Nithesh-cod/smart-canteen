import { useEffect, useRef, useState } from 'react';
import socketService from '../services/socket.service';

type Role = 'student' | 'chef' | 'owner';

export const useSocket = (role: Role, id?: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    const socket = socketService.connect();

    const handleConnect = () => {
      setIsConnected(true);
      if (!joinedRef.current) {
        joinedRef.current = true;
        if (role === 'student' && id) socketService.joinAsStudent(id);
        else if (role === 'chef')    socketService.joinAsChef();
        else if (role === 'owner')   socketService.joinAsOwner();
      }
    };

    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [role, id]);

  return { socket: socketService, isConnected };
};
