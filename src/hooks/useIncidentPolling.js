import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../lib/config";

export default function useIncidentPolling(incidentId) {
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;

    async function fetchIncident() {
      if (!incidentId) return;
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/incidents/${incidentId}`
        );
        if (isMountedRef.current && res.data?.data) {
          setIncident(res.data.data);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err.response?.data?.message || "Failed to fetch status");
        }
      }
    }

    fetchIncident();
    intervalRef.current = setInterval(fetchIncident, 10000);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [incidentId]);

  return { incident, error };
}
