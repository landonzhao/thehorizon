#!/bin/bash

BASE_URL="http://localhost:3002"
SECRET="iloveburgerkingdoublecheeseburgerlargefrenchfriesonionringsandcokefloat"

START="2026-01-01"
END="2026-05-19"
MAX_DAYS=7

while [[ "$START" < "$END" || "$START" == "$END" ]]; do
  echo "Backfilling from $START..."

  RESPONSE=$(curl -s -H "Authorization: Bearer $SECRET" \
    "$BASE_URL/api/backfill?start=$START&end=$END&maxDays=$MAX_DAYS")

  echo "$RESPONSE"

  NEXT_START=$(echo "$RESPONSE" | node -e "
    let data='';
    process.stdin.on('data', c => data += c);
    process.stdin.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log(json.next_start || '');
      } catch {
        console.log('');
      }
    });
  ")

  if [[ -z "$NEXT_START" || "$NEXT_START" == "$START" ]]; then
    echo "No next_start returned. Stopping."
    break
  fi

  START="$NEXT_START"
  sleep 2
done

echo "Backfill complete."