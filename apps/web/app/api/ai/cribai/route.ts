import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query, campusSlug } = await request.json() as {
      query: unknown;
      campusSlug: unknown;
    };

    if (typeof query !== 'string' || typeof campusSlug !== 'string') {
      return NextResponse.json(
        { error: 'Missing query or campusSlug' },
        { status: 400 },
      );
    }

    // Phase 5: Implement streaming CribAI response
    // 1. Validate auth + rate limit
    // 2. Load PageIndex tree for campus
    // 3. Traverse tree with query
    // 4. Stream Claude response

    return NextResponse.json({
      message: 'CribAI endpoint not yet implemented',
      query,
      campusSlug,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
