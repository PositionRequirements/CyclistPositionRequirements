require "fileutils"
require "json"

ROOT = File.expand_path("..", __dir__)

def key_for(index)
  format("%.2f", (index + 1) / 100.0)
end

def value_for(mean, std)
  (mean * std).round(4)
end

table = {}

100.times do |mean_index|
  mean_key = key_for(mean_index)
  mean = mean_key.to_f
  row = {}

  100.times do |std_index|
    std_key = key_for(std_index)
    std = std_key.to_f
    value = value_for(mean, std)

    row[std_key] = {
      "PMA" => value,
      "PFA" => value
    }
  end

  table[mean_key] = row
end

output = "#{JSON.pretty_generate(table)}\n"

["errors.json", "site/errors.json"].each do |relative_path|
  destination = File.join(ROOT, relative_path)
  FileUtils.mkdir_p(File.dirname(destination))
  File.write(destination, output)
end
