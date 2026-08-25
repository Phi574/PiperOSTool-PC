using System;
using System.Diagnostics;
using System.IO;

internal static class PiperAirPlayReceiver
{
    private static string Value(string[] args, string key, string fallback)
    {
        for (var index = 0; index + 1 < args.Length; index++)
            if (string.Equals(args[index], key, StringComparison.OrdinalIgnoreCase)) return args[index + 1];
        return fallback;
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    public static int Main(string[] args)
    {
        var baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
        var receiverDirectory = Path.Combine(baseDirectory, "uxplay");
        var receiver = Path.Combine(receiverDirectory, "uxplay-windows.exe");
        if (!File.Exists(receiver))
        {
            Console.Error.WriteLine("PiperOS AirPlay engine is missing. Reinstall PiperOS Tool.");
            return 2;
        }

        var name = Value(args, "--name", "PiperOS View Remote PC");
        var resolution = Value(args, "--resolution", "1080p");
        var fps = Value(args, "--fps", "60");
        var size = resolution == "1440p" ? "2560x1440" : resolution == "Native" ? "1920x1080" : "1920x1080";
        var options = "-n " + Quote(name) + " -nh -s " + size + "@" + fps + " -fps " + fps + " -vs d3d11videosink";

        var process = Process.Start(new ProcessStartInfo(receiver, options)
        {
            WorkingDirectory = receiverDirectory,
            UseShellExecute = false
        });
        if (process == null) return 3;
        process.WaitForExit();
        return process.ExitCode;
    }
}
