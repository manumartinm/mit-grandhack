import type { ScreeningSession, OutbreakAlert } from '../../types';

const CLUSTER_RADIUS_KM = 2;
const CLUSTER_TIME_WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_CASES_FOR_ALERT = 3;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function detectOutbreaks(sessions: ScreeningSession[]): OutbreakAlert[] {
  const now = Date.now();
  const recentHighRisk = sessions.filter(
    (s) =>
      s.cnnOutput?.pneumoniaRiskBucket === 'high' &&
      s.gpsLat !== undefined &&
      s.gpsLon !== undefined &&
      now - new Date(s.startedAt).getTime() < CLUSTER_TIME_WINDOW_MS
  );

  if (recentHighRisk.length < MIN_CASES_FOR_ALERT) return [];

  const visited = new Set<string>();
  const alerts: OutbreakAlert[] = [];

  for (const session of recentHighRisk) {
    if (visited.has(session.id)) continue;

    const cluster = recentHighRisk.filter(
      (other) =>
        haversineKm(session.gpsLat!, session.gpsLon!, other.gpsLat!, other.gpsLon!) <= CLUSTER_RADIUS_KM
    );

    if (cluster.length >= MIN_CASES_FOR_ALERT) {
      cluster.forEach((s) => visited.add(s.id));

      const avgLat = cluster.reduce((sum, s) => sum + s.gpsLat!, 0) / cluster.length;
      const avgLon = cluster.reduce((sum, s) => sum + s.gpsLon!, 0) / cluster.length;

      alerts.push({
        id: `outbreak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        detectedAt: new Date().toISOString(),
        centerLat: avgLat,
        centerLon: avgLon,
        radiusKm: CLUSTER_RADIUS_KM,
        caseCount: cluster.length,
        sessionIds: cluster.map((s) => s.id),
        acknowledged: false,
      });
    }
  }

  return alerts;
}
