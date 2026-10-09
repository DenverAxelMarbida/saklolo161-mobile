import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../lib/config";
import { saveResolvedIncident, removeIncidentId } from "../../lib/storage";

export default function useIncidentPolling(incidentId) {
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const isMountedRef = useRef(true);
  const intervalRef = useRef(null);
  const lastIdRef = useRef(null);
  const fetchRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;

    async function fetchIncident() {
      if (!incidentId) return;

      if (lastIdRef.current !== incidentId) {
        setIncident(null);
        setError(null);
        setNotFound(false);
        lastIdRef.current = incidentId;
      }

      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/incidents/${incidentId}`
        );
        if (!isMountedRef.current) return;
        if (res.data?.data) {
          const data = res.data.data;
          setIncident(data);
          setError(null);
          setNotFound(false);
          if (data.status === "Resolved") {
            saveResolvedIncident(data);
            removeIncidentId(data.incidentId);
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        const status = err.response?.status;
        if (status === 404) {
          setNotFound(true);
          setIncident(null);
          setError(null);
          removeIncidentId(incidentId);
        } else {
          setError(err.response?.data?.message || "Failed to fetch status");
        }
      }
    }

    fetchRef.current = fetchIncident;
    fetchIncident();
    intervalRef.current = setInterval(fetchIncident, 10000);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [incidentId]);

  // Manual refresh: reuses the exact same per-incident fetch the 10-second
  // interval runs (same endpoint, same guards). The polling contract is
  // unchanged — this only lets pull-to-refresh trigger one immediate pass.
  const refetch = useCallback(() => {
    if (fetchRef.current) return fetchRef.current();
    return Promise.resolve();
  }, []);

  return { incident, error, notFound, refetch };
}
