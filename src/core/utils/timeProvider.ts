import dayjs from 'dayjs';
import { Client } from '@stomp/stompjs';
import { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';

// Global variable to store offset (in seconds)
(window as any).SIMULATED_OFFSET_SECONDS = 0;

export const setSimulatedOffset = (seconds: number) => {
    (window as any).SIMULATED_OFFSET_SECONDS = seconds;
};

export const getSimulatedOffset = () => {
    return (window as any).SIMULATED_OFFSET_SECONDS || 0;
};

// Fetch initial offset from server
export const refreshSimulatedOffset = async () => {
    try {
        const res = await axiosClient.get('/public/time-offset');
        if (res.data && res.data.data !== undefined) {
            setSimulatedOffset(Number(res.data.data));
        }
    } catch (e) {
        console.error("Failed to fetch initial time offset", e);
    }
};

refreshSimulatedOffset();

// Initialize WebSocket for Time Sync
const stompClient = new Client({
    brokerURL: 'ws://localhost:8080/ws-pbms',
    onConnect: () => {
        stompClient.subscribe('/topic/time-sync', (message) => {
            if (message.body) {
                try {
                    const data = JSON.parse(message.body);
                    if (typeof data.offsetSeconds === 'number') {
                        setSimulatedOffset(data.offsetSeconds);
                    }
                } catch (e) {
                    console.error("Failed to parse time-sync message", e);
                }
            }
        });
    },
    onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
    }
});

stompClient.activate();

/**
 * Get current system date-time (with fast-forward offset)
 */
export const simulatedDayjs = (date?: dayjs.ConfigType, format?: dayjs.OptionType, strict?: boolean) => {
    if (date !== undefined) {
        return dayjs(date, format, strict);
    }
    const offsetSeconds = getSimulatedOffset();
    return dayjs().add(offsetSeconds, 'second');
};

/**
 * React hook that returns a ticking system time which instantly updates on fast-forward
 */
export const useSystemTime = () => {
    const [time, setTime] = useState(simulatedDayjs());

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(simulatedDayjs());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return time;
};

/**
 * React hook that returns the current simulated offset
 */
export const useSimulatedOffset = () => {
    const [offset, setOffset] = useState(getSimulatedOffset());

    useEffect(() => {
        const timer = setInterval(() => {
            if (getSimulatedOffset() !== offset) {
                setOffset(getSimulatedOffset());
            }
        }, 500);
        return () => clearInterval(timer);
    }, [offset]);

    return offset;
};
