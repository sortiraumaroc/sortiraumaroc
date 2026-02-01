-- Dashboard aggregation functions

-- Function to get daily reservations count
CREATE OR REPLACE FUNCTION get_daily_reservations(start_date DATE, end_date DATE)
RETURNS TABLE(date DATE, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(b.created_at) as date,
    COUNT(*)::BIGINT as count
  FROM bookings b
  WHERE DATE(b.created_at) BETWEEN start_date AND end_date
    AND b.status != 'cancelled'
  GROUP BY DATE(b.created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

-- Function to get top cities by reservations
CREATE OR REPLACE FUNCTION get_top_cities_by_reservations(start_date DATE, end_date DATE, limit_count INT DEFAULT 5)
RETURNS TABLE(city TEXT, reservations BIGINT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(e.city, 'Inconnu') as city,
    COUNT(b.id)::BIGINT as reservations,
    COALESCE(SUM(b.total_amount), 0) as revenue
  FROM bookings b
  LEFT JOIN establishments e ON b.establishment_id = e.id
  WHERE DATE(b.created_at) BETWEEN start_date AND end_date
    AND b.status != 'cancelled'
  GROUP BY e.city
  ORDER BY reservations DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get top categories by reservations
CREATE OR REPLACE FUNCTION get_top_categories_by_reservations(start_date DATE, end_date DATE, limit_count INT DEFAULT 5)
RETURNS TABLE(universe TEXT, reservations BIGINT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(e.universe, 'Autre') as universe,
    COUNT(b.id)::BIGINT as reservations,
    COALESCE(SUM(b.total_amount), 0) as revenue
  FROM bookings b
  LEFT JOIN establishments e ON b.establishment_id = e.id
  WHERE DATE(b.created_at) BETWEEN start_date AND end_date
    AND b.status != 'cancelled'
  GROUP BY e.universe
  ORDER BY reservations DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get daily revenue
CREATE OR REPLACE FUNCTION get_daily_revenue(start_date DATE, end_date DATE)
RETURNS TABLE(date DATE, gmv NUMERIC, deposits NUMERIC, commissions NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(b.created_at) as date,
    COALESCE(SUM(b.total_amount), 0) as gmv,
    COALESCE(SUM(b.deposit_amount), 0) as deposits,
    COALESCE(SUM(b.commission_amount), 0) as commissions
  FROM bookings b
  WHERE DATE(b.created_at) BETWEEN start_date AND end_date
    AND b.status != 'cancelled'
  GROUP BY DATE(b.created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_daily_reservations TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_cities_by_reservations TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_categories_by_reservations TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_revenue TO authenticated;
