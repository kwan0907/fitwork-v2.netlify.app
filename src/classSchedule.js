export function sameCourse(a, b) {
  return a?.date === b?.date && a?.branch === b?.branch && a?.start === b?.start &&
    a?.end === b?.end && a?.title === b?.title && a?.coach === b?.coach
}

export function findAvailableCourse(rows, selected) {
  return rows.find(row => sameCourse(row, selected) && !row.full)
}
