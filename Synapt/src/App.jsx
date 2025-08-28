import { useState, useEffect, useMemo } from "react";
import { AgGridReact } from 'ag-grid-react';
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

// --- NEW IMPORTS FOR CHARTS ---
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import "./App.css";

// --- NEW: Register Chart.js components. This is a required step! ---
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// --- NEW: DataVisualization Component ---
// This component decides whether to render a chart or a table.
const DataVisualization = ({ vizType, tableData, rowData, columnDefs }) => {
  // Transform our API data into the format Chart.js expects
  const chartData = useMemo(() => {
    if (!tableData || !tableData.headers || !tableData.rows) {
      return { labels: [], datasets: [] };
    }

    const labels = tableData.rows.map(row => row[0]); // Assumes first column is the label
    const dataPoints = tableData.rows.map(row => row[1]); // Assumes second column is the value

    return {
      labels,
      datasets: [
        {
          label: tableData.headers[1] || 'Dataset', // Use the second header as the label
          data: dataPoints,
          backgroundColor: [ // Add some nice default colors
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 99, 132, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)',
          ],
          borderColor: [
            'rgba(54, 162, 235, 1)',
            'rgba(255, 99, 132, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(153, 102, 255, 1)',
            'rgba(255, 159, 64, 1)',
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [tableData]);

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };

  switch (vizType) {
    case 'bar':
      return <Bar options={chartOptions} data={chartData} />;
    case 'line':
      return <Line options={chartOptions} data={chartData} />;
    case 'pie':
      return <Pie options={chartOptions} data={chartData} />;
    case 'table':
    default:
      // Fallback to the AG Grid table
      return (
        <div className="ag-theme-alpine" style={{ width: '100%' }}>
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={{ flex: 1 }}
            domLayout="autoHeight"
          />
        </div>
      );
  }
};


function App() {
  const [form, setForm] = useState({
    topic: "",
    skill_tags: "",
    question_type: "mcq",
    difficulty: "easy",
    question_section: "data_interpretation",
    programming_language: "",
  });

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // AG Grid specific state (still needed for 'table' type)
  const [rowData, setRowData] = useState([]);
  const [columnDefs, setColumnDefs] = useState([]);


  useEffect(() => {
    // This effect now ONLY prepares data for AG Grid, for when it's needed
    if (result && result.question_section === 'data_interpretation' && result.data?.tableData) {
      const { headers, rows } = result.data.tableData;

      const defs = headers.map(header => ({
        field: header, sortable: true, filter: true, resizable: true,
      }));
      setColumnDefs(defs);

      const data = rows.map(rowArray => {
        const rowObject = {};
        headers.forEach((header, index) => {
          rowObject[header] = rowArray[index];
        });
        return rowObject;
      });
      setRowData(data);
    }
  }, [result]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // If question_type is changed to 'programming', lock question_section
    if (name === "question_type" && value === "programming") {
      setForm({ ...form, question_type: value, question_section: "programming" });
    } else if (name === "question_type") {
      // If switching away from programming, reset question_section to default
      setForm({ ...form, question_type: value, question_section: "technical_aptitude" });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    setError(null);
    setLoading(true);

    const payload = { ...form };

    try {
      const res = await fetch("http://localhost:7000/generate_question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Server returned an error");
      } else {
        setResult({ ...data, question_section: payload.question_section });
      }
    } catch (err) {
      setError("Server not reachable: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm({
      topic: "", skill_tags: "", question_type: "mcq", difficulty: "easy",
      question_section: "technical_aptitude", programming_language: "",
    });
    setResult(null);
    setError(null);
  };

  const renderStandardQuestion = (res) => {
    // ... This function remains unchanged
    switch (res.question_type) {
      case "mcq":
      case "multi_select":
        return (
          <>
            <p><strong>Question:</strong> {res.question}</p>
            {res.options && Array.isArray(res.options) && (
              <ul>
                {res.options.map((opt, idx) => <li key={idx}>{opt}</li>)}
              </ul>
            )}
            <p><strong>Answer:</strong> {Array.isArray(res.answer) ? res.answer.join(", ") : res.answer}</p>
            <p><strong>Explanation:</strong> {res.explanation}</p>
          </>
        );
      default:
        return (
          <>
            <p><strong>Question:</strong> {res.question}</p>
            <p><strong>Answer:</strong> {res.answer}</p>
            <p><strong>Explanation:</strong> {res.explanation}</p>
          </>
        );
    }
  };

  const renderQuestion = (res) => {
    if (!res) return null;

    switch (res.question_section) {
      case "data_interpretation":
        return (
          <div className="section-output">
            <h3 className="section-title">Data Interpretation</h3>

            {res.data?.dataContext && <p className="data-context"><strong>Context:</strong> {res.data.dataContext} (Visualization Type: {res.data.type})</p>}

            {/* --- MODIFIED: Use the new DataVisualization component --- */}
            <div className="visualization-container">
              <DataVisualization
                vizType={res.data?.type}
                tableData={res.data?.tableData}
                rowData={rowData} // Pass AG Grid data through
                columnDefs={columnDefs} // Pass AG Grid data through
              />
            </div>

            <div className="standard-question-area">
              {renderStandardQuestion(res)}
            </div>
          </div>
        );

      // ... other cases remain the same
      case "logical_reasoning": // (Your other sections are unaffected
        return (
          <div className="section-output">
            <h3 className="section-title">Logical Reasoning</h3>

            {res.question_section === "linked_question" && res.premiseText && (
              <div className="scenario-placeholder">
                {res.premiseText}
              </div>
            )}

            {renderStandardQuestion(res)}
          </div>
        );

      case "verbal":
            // --- UPDATED PROGRAMMING CASE ---
      case "programming":
        return (
          <div className="section-output">
            <h3 className="section-title">Programming Challenge</h3>
            <p><strong>Problem:</strong> {res.question}</p>

            {res.starter_code && (
              <>
                <h4>Starter Code:</h4>
                <pre className="code-block"><code>{res.starter_code}</code></pre>
              </>
            )}

            {res.sample_test_cases && (
                <>
                  <h4>Sample Test Cases:</h4>
                  <table className="test-cases-table">
                    <thead>
                      <tr>
                        {res.sample_test_cases.headers.map((header, index) => (
                          <th key={index}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {res.sample_test_cases.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
            )}
            
            <h4>Solution:</h4>
            <pre className="code-block"><code>{res.solution_code}</code></pre>
            
            {/* --- NEW: Renders structured explanation object --- */}
            <div className="explanation-section">
              {typeof res.explanation === 'object' && res.explanation !== null ? (
                <>
                  <h4>Explanation</h4>
                  {res.explanation.Approach && (
                      <>
                          <p><strong>Approach:</strong></p>
                          <p>{res.explanation.Approach}</p>
                      </>
                  )}
                  {res.explanation['Step-by-step Logic'] && (
                      <>
                          <p><strong>Step-by-step Logic:</strong></p>
                          {/* Use pre-wrap to preserve newlines from the backend response */}
                          <p style={{ whiteSpace: 'pre-wrap' }}>{res.explanation['Step-by-step Logic']}</p>
                      </>
                  )}
  
                  {res.explanation['Complexity Analysis'] && (
                      <>
                          <p><strong>Complexity Analysis:</strong></p>
                          <p>{res.explanation['Complexity Analysis']}</p>
                      </>
                  )}
                </>
              ) : (
                // Fallback for simple string explanation
                <>
                    <h4>Explanation:</h4>
                    <p>{res.explanation}</p>
                </>
              )}
            </div>
          </div>
        );
      case "technical_aptitude":
      default:
        return (
          <div className="section-output">
            <h3 className="section-title">{res.question_section.replace('_', ' ')}</h3>
            {renderStandardQuestion(res)}
          </div>
        );
    }
  };

  return (
    <div className="app-container">
      <h1>SYNAPT Question Generator</h1>
      <div className="content-wrapper">
        <div className="form-section">
          {/* Form JSX remains the same */}
          <form onSubmit={handleSubmit}>
            <label> Topic:
              <input name="topic" placeholder="e.g., React Hooks" value={form.topic} onChange={handleChange} required />
            </label>
            <label> Skill Tags (comma separated):
              <input name="skill_tags" placeholder="e.g., JavaScript, State Management" value={form.skill_tags} onChange={handleChange} />
            </label>
            <label> Question Type:
              <select name="question_type" value={form.question_type} onChange={handleChange}>
                <option value="mcq">MCQ</option>
                <option value="multi_select">Multi Select</option>
                <option value="true_false">True/False</option>
                <option value="fillups">Fillups</option>
                <option value="free_text">Free Text</option>
                {/* <option value="linked_question">Linked Question</option> */}
                <option value="programming">Programming</option>
              </select>
            </label>
            <label> Difficulty:
              <select name="difficulty" value={form.difficulty} onChange={handleChange}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            {/* Only show Question Section if not programming */}
            {form.question_type !== "programming" && (
              <label> Question Section:
                <select name="question_section" value={form.question_section} onChange={handleChange}>
                  {/* <option value="data_interpretation">Data Interpretation</option> */}
                  {/* <option value="verbal">Verbal</option> */}
                  <option value="logical_reasoning">Logical Reasoning</option>
                  <option value="technical_aptitude">Technical Aptitude</option>
                  <option value="programming">Programming</option>
                </select>
              </label>
            )}
            {form.question_type === "programming" && (
              <label> Programming Language:
                <select name="programming_language" value={form.programming_language} onChange={handleChange}>
                  <option value="">-- Select Language --</option>
                  <option value="c">C</option>
                  <option value="c++">C++</option>
                  <option value="java">Java</option>
                  <option value="python">Python</option>
                </select>
              </label>
            )}
            <div className="button-group">
              <button type="submit" disabled={loading}>{loading ? "Generating..." : "Generate"}</button>
              <button type="button" onClick={handleReset}>Reset</button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}
        </div>
        <div className="result-section">
          {loading && <div className="loading">Loading AI question...</div>}
          {result && <div className="result-card">{renderQuestion(result)}</div>}
        </div>
      </div>
    </div>
  );
}

export default App;