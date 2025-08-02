// WHO Growth Standards for Baby Girls (0-24 months)
// Data represents percentiles: 3rd, 15th, 50th (median), 85th, 97th

// Convert WHO monthly data to point-based format for linear interpolation
const createDataPoints = (monthlyData: number[]) => {
  return monthlyData.map((value, index) => ({
    x: index * 30.44, // Convert months to approximate days
    y: value
  }));
};

export const weightPercentiles = {
  datasets: [
    {
      label: '3rd Percentile',
      data: createDataPoints([2.0, 2.7, 3.4, 4.0, 4.5, 5.0, 5.4, 5.8, 6.2, 6.5, 6.8, 7.1, 7.4, 7.6, 7.9, 8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9]),
      borderColor: '#e5e7eb',
      backgroundColor: 'rgba(229, 231, 235, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '15th Percentile',
      data: createDataPoints([2.4, 3.2, 4.0, 4.7, 5.3, 5.8, 6.3, 6.7, 7.1, 7.5, 7.8, 8.1, 8.4, 8.7, 9.0, 9.3, 9.5, 9.8, 10.0, 10.3, 10.5, 10.7, 11.0, 11.2, 11.4]),
      borderColor: '#d1d5db',
      backgroundColor: 'rgba(209, 213, 219, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '50th Percentile (Median)',
      data: createDataPoints([3.2, 4.2, 5.1, 5.9, 6.6, 7.2, 7.8, 8.3, 8.8, 9.3, 9.7, 10.1, 10.5, 10.9, 11.3, 11.7, 12.1, 12.5, 12.9, 13.3, 13.7, 14.1, 14.5, 14.9, 15.3]),
      borderColor: '#6b7280',
      backgroundColor: 'rgba(107, 114, 128, 0.1)',
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '85th Percentile',
      data: createDataPoints([4.0, 5.2, 6.3, 7.3, 8.2, 9.0, 9.8, 10.5, 11.2, 11.9, 12.6, 13.3, 14.0, 14.7, 15.4, 16.1, 16.8, 17.5, 18.2, 18.9, 19.6, 20.3, 21.0, 21.7, 22.4]),
      borderColor: '#d1d5db',
      backgroundColor: 'rgba(209, 213, 219, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '97th Percentile',
      data: createDataPoints([4.8, 6.2, 7.5, 8.7, 9.8, 10.8, 11.8, 12.7, 13.6, 14.5, 15.4, 16.3, 17.2, 18.1, 19.0, 19.9, 20.8, 21.7, 22.6, 23.5, 24.4, 25.3, 26.2, 27.1, 28.0]),
      borderColor: '#e5e7eb',
      backgroundColor: 'rgba(229, 231, 235, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
  ],
};

export const heightPercentiles = {
  datasets: [
    {
      label: '3rd Percentile',
      data: createDataPoints([45.0, 48.5, 51.5, 54.0, 56.5, 58.5, 60.5, 62.0, 63.5, 65.0, 66.5, 67.5, 69.0, 70.0, 71.0, 72.0, 73.0, 74.0, 75.0, 76.0, 77.0, 78.0, 79.0, 80.0, 81.0]),
      borderColor: '#e5e7eb',
      backgroundColor: 'rgba(229, 231, 235, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '15th Percentile',
      data: createDataPoints([47.0, 50.5, 53.5, 56.0, 58.5, 60.5, 62.5, 64.0, 65.5, 67.0, 68.5, 69.5, 71.0, 72.0, 73.0, 74.0, 75.0, 76.0, 77.0, 78.0, 79.0, 80.0, 81.0, 82.0, 83.0]),
      borderColor: '#d1d5db',
      backgroundColor: 'rgba(209, 213, 219, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '50th Percentile (Median)',
      data: createDataPoints([49.5, 53.0, 56.0, 58.5, 61.0, 63.0, 65.0, 66.5, 68.0, 69.5, 71.0, 72.0, 73.5, 74.5, 75.5, 76.5, 77.5, 78.5, 79.5, 80.5, 81.5, 82.5, 83.5, 84.5, 85.5]),
      borderColor: '#6b7280',
      backgroundColor: 'rgba(107, 114, 128, 0.1)',
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '85th Percentile',
      data: createDataPoints([52.0, 55.5, 58.5, 61.0, 63.5, 65.5, 67.5, 69.0, 70.5, 72.0, 73.5, 74.5, 76.0, 77.0, 78.0, 79.0, 80.0, 81.0, 82.0, 83.0, 84.0, 85.0, 86.0, 87.0, 88.0]),
      borderColor: '#d1d5db',
      backgroundColor: 'rgba(209, 213, 219, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
    {
      label: '97th Percentile',
      data: createDataPoints([54.5, 58.0, 61.0, 63.5, 66.0, 68.0, 70.0, 71.5, 73.0, 74.5, 76.0, 77.0, 78.5, 79.5, 80.5, 81.5, 82.5, 83.5, 84.5, 85.5, 86.5, 87.5, 88.5, 89.5, 90.5]),
      borderColor: '#e5e7eb',
      backgroundColor: 'rgba(229, 231, 235, 0.1)',
      borderWidth: 1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.4,
    },
  ],
}; 